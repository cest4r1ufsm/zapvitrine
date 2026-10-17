# Relatório final de configuração do AGTGestor

**Data:** 16/10/2026  
**Ambiente:** produção em `https://agentegestor.com.br`  
**Objetivo:** listar somente o que ainda falta, em ordem segura, e indicar exatamente o que depende do proprietário das contas.

## 1. Resumo executivo

A infraestrutura principal já está implantada. O site e a API estão online em HTTPS, os dados foram migrados do SQLite para PostgreSQL/PostGIS, o Redis está ativo, as imagens usam Cloudflare R2 e foi realizado um ensaio real de restauração do banco. O código corrigido também foi enviado para a branch `feat/base-nacional`.

O sistema ainda não deve ser considerado integralmente homologado para clientes pagantes. Faltam ações nas contas externas e testes de ponta a ponta que exigem o proprietário, um celular real ou uma compra de teste.

### Prioridades

| Prioridade | Pendência | Quem precisa agir | Impacto |
|---|---|---|---|
| Crítica | Regularizar a renovação do VPS Hostinger | Proprietário da conta | Evita suspensão de toda a produção |
| Alta | Concluir Mapbox e recompilar o cliente | Proprietário + agente | Libera mapa e busca por endereço |
| Alta | Concluir análise/permissões da Meta e testar um número real | Proprietário + agente | Libera WhatsApp oficial em produção |
| Alta | Homologar compra e restauração no Google Play | Proprietário + aparelho Android | Confirma cobrança dentro do app |
| Alta | Testar Stripe, e-mail e exclusão de conta | Proprietário + agente | Confirma os fluxos comerciais e de acesso |
| Média | Trocar o endereço temporário do R2 por domínio de mídia | Proprietário + agente | Remove limitação do `r2.dev` e melhora operação |
| Média | Automatizar backup externo e monitoramento | Proprietário + agente | Reduz risco operacional |
| Média | Publicar o primeiro estabelecimento real no diretório | Proprietário/administrador | A busca pública deixa de retornar vazia |

## 2. O que já está pronto

- Produção disponível em `https://agentegestor.com.br`.
- API saudável em `/api/health`.
- PostgreSQL 17 com PostGIS 3.5 ativo.
- Redis 8 com TLS e rede privada.
- Migração validada: 24 tabelas e 36 registros conferidos entre origem e destino.
- Cloudflare R2 testado com envio, leitura pública e exclusão real.
- Imagem legada migrada para o R2.
- Backup PostgreSQL criado e restaurado em banco separado com contagens conferidas.
- Rotas públicas, privacidade, diretório e associação Android respondendo corretamente.
- Segredos mantidos fora do Git.
- Acesso SSH por chave configurado.
- Correções de inicialização do Redis e bootstrap do PostgreSQL enviadas ao repositório.

Não é necessário recriar o VPS, reinstalar o banco, repetir a migração ou cadastrar novamente o aplicativo Google Play.

## 3. Passo a passo obrigatório

### Passo 1 — Regularizar o VPS imediatamente

Foi exibido no painel da Hostinger um aviso de que a renovação do plano **KVM 2** foi recusada pelo banco, com vencimento indicado para **13/11/2026**.

1. Entre na conta Hostinger que administra `srv1529734`.
2. Abra **Faturamento** ou o aviso de renovação do VPS.
3. Atualize o meio de pagamento, se necessário.
4. Renove o plano KVM 2 e confirme que o status mudou para ativo/renovado.
5. Não reinstale o sistema operacional e não use a opção de redefinir o VPS.
6. Guarde a fatura ou confirmação de pagamento.

**Aceite:** o painel não mostra mais risco de expiração e apresenta uma nova data de validade.

### Passo 2 — Configurar o Mapbox

**Atualização de execução:** concluído em 16/10/2026. Foram criados tokens separados para navegador e servidor; o build com o token público foi publicado; o token de geocodificação ficou somente no ambiente protegido do VPS; `permanent=true` foi habilitado; uma consulta real retornou HTTP 200 com coordenadas válidas. Resta somente o teste visual no Android dentro da homologação final.

Hoje o backend não tem `MAPBOX_GEOCODING_TOKEN`, o build do navegador não tem `VITE_MAPBOX_PUBLIC_TOKEN` e a autorização para geocodificação permanente não foi confirmada. Sem isso, o diretório funciona em modo de lista/localização alternativa, mas o mapa e a busca por endereço não ficam completos.

#### 2.1 Token público do mapa

1. Entre em **Mapbox → Tokens**.
2. Crie um token público separado para produção.
3. Dê apenas permissões públicas necessárias para carregar mapas, estilos e fontes.
4. Restrinja as URLs a:
   - `https://agentegestor.com.br/*`
   - `https://www.agentegestor.com.br/*`, somente se esse host for usado.
5. Identifique-o como `agtgestor-web-producao`.
6. O token deve começar com `pk.`. Ele será usado apenas no build do cliente.

#### 2.2 Token privado de geocodificação

1. Crie outro token, exclusivo para o servidor.
2. Habilite somente os escopos que o painel exigir para a API de busca/geocodificação.
3. Não coloque esse token no código, no navegador ou no Git.
4. Confirme no plano/conta Mapbox se o uso permite **geocodificação permanente**, pois o AGTGestor precisa salvar as coordenadas confirmadas do estabelecimento.
5. Defina limite de gastos e alertas no painel Mapbox.

#### 2.3 Aplicação técnica

Depois de criar os tokens, configure-os diretamente no servidor ou disponibilize-os por um canal seguro. Não cole tokens no chat. A etapa técnica restante é:

- incluir o token `pk.` como `VITE_MAPBOX_PUBLIC_TOKEN` no build;
- incluir o token privado como `MAPBOX_GEOCODING_TOKEN` no runtime;
- marcar `MAPBOX_PERMANENT_GEOCODING=true` somente após a autorização estar confirmada;
- reconstruir e publicar a imagem;
- testar mapa, busca, marcador, endereço confirmado e uso no Android.

**Aceite:** mapa aparece no navegador e no app; um endereço real é encontrado; as coordenadas podem ser confirmadas e o perfil permanece correto após recarregar.

### Passo 3 — Concluir Meta/WhatsApp oficial

Já existem app, portfólio, configuração de Embedded Signup e webhook. A verificação empresarial foi enviada para análise. O que falta é a aprovação externa e a homologação real.

1. Entre no **Meta Business Manager / Central de Segurança**.
2. Confira o estado da verificação empresarial.
3. Se aparecer solicitação adicional, envie somente documentos reais e consistentes com a empresa.
4. Entre em **Meta for Developers → AGTGestor → WhatsApp**.
5. Confirme os URLs públicos:
   - política: `https://agentegestor.com.br/privacidade`
   - termos: `https://agentegestor.com.br/termos`
   - exclusão: `https://agentegestor.com.br/excluir-conta`
   - webhook: `https://agentegestor.com.br/api/webhook/meta`
6. Confirme as permissões `whatsapp_business_management` e `whatsapp_business_messaging`.
7. Faça o fluxo de análise do aplicativo, se o painel ainda restringir o uso aos administradores. Grave o vídeo solicitado mostrando login, autorização, conexão e uso real.
8. No Android com WhatsApp Business, abra o painel do AGTGestor e use **Conectar com WhatsApp**.
9. Autorize um número empresarial elegível.
10. De outro número, envie uma mensagem para o número conectado.
11. Teste resposta do robô, criação de agendamento/pedido, pausa, retomada, atendimento manual, desconexão e nova autorização.
12. Se forem necessárias mensagens iniciadas pela empresa fora da janela permitida, crie e envie os modelos para aprovação no WhatsApp Manager.

**Aceite:** usuário não administrador consegue autorizar; o webhook recebe a mensagem; o robô responde; o agendamento aparece no painel; reconexão funciona sem usar a integração não oficial.

### Passo 4 — Homologar o Google Play Billing

**Atualização de execução:** a API do Google Play foi consultada com a conta de serviço de produção. O pacote `br.com.agentegestor.app`, produto `agtgestor_premium_mensal` e plano-base `mensal` estão ativos, autorrenováveis e disponíveis no Brasil por R$ 27,99. Ainda falta a compra/restauração/cancelamento em aparelho real.

O aplicativo e a assinatura já existem. O pacote esperado é `br.com.agentegestor.app`, e o produto é `agtgestor_premium_mensal`, plano-base `mensal`.

1. No Play Console, confirme que o produto e o plano-base estão ativos na região desejada.
2. Confirme que a conta de serviço do AGTGestor ainda tem acesso ao aplicativo e às assinaturas.
3. Adicione uma conta Google sua à lista de testadores de licença e à faixa interna/fechada usada para testes.
4. Instale o aplicativo pelo link oficial dessa faixa; não use APK instalado manualmente para testar cobrança.
5. Entre com uma conta de loja de teste no AGTGestor.
6. Faça uma compra de teste.
7. Confirme no painel que o Premium ficou ativo e que a origem da assinatura é Google Play.
8. Feche/reinstale o app e use **Restaurar compra**.
9. Teste cancelamento, renovação e expiração usando os ciclos acelerados de teste da Play.
10. Confirme que uma assinatura Stripe ativa não é substituída indevidamente por uma compra Play.

**Aceite:** compra, reconhecimento, restauração, cancelamento e expiração refletem corretamente no painel e no acesso Premium.

### Passo 5 — Homologar Stripe

**Atenção:** a consulta real encontrou o Stripe em modo live, preço ativo de R$ 29,90/mês e webhook habilitado, enquanto o site mostra R$ 27,90/mês. O proprietário precisa escolher o preço definitivo antes da abertura ao público; a correção não deve ser feita silenciosamente.

As configurações existem no servidor, mas presença de chaves não prova que o fluxo comercial funciona.

1. Entre no Stripe e confira se a conta está no ambiente desejado: teste para homologação, produção para cobrança real.
2. Confirme que `STRIPE_PRICE_ID` aponta para o preço correto e recorrente.
3. Confira o endpoint de webhook público `https://agentegestor.com.br/api/webhook/stripe`.
4. Confirme o segredo de assinatura do webhook sem copiá-lo para documentos ou chat.
5. Execute checkout com um usuário de teste.
6. Confirme a ativação do Premium.
7. Abra o Portal do Cliente e teste cancelamento.
8. Reenvie um evento pelo painel Stripe e confirme que ele não duplica assinatura nem altera o cliente errado.
9. Teste evento atrasado, falha de pagamento e retomada.

**Aceite:** checkout, webhook assinado, portal, cancelamento e eventos repetidos/atrasados mantêm o estado correto.

### Passo 6 — Homologar e-mail

**Atualização de execução (2026-10-17):** autenticação SMTP com a Brevo foi validada em produção. O painel Brevo marca `agentegestor.com.br` como autenticado: Brevo Code, os dois registros DKIM por CNAME e o DMARC estão validados. A resolução DNS pública confirmou `brevo1._domainkey`, `brevo2._domainkey` e `_dmarc` (`p=none`). Não é necessária correção de DNS neste momento. Ainda falta enviar e receber mensagens reais para homologar a entrega e os links.

1. Crie uma conta nova com um e-mail ao qual você tenha acesso.
2. Confirme que o e-mail de ativação chega e abre o domínio correto.
3. Use **Esqueci minha senha**, abra o link e altere a senha.
4. Teste Gmail e outro provedor; examine também spam e promoções.
5. Verifique no provedor se houve rejeição, bloqueio ou limite de envio.

**Aceite:** confirmação e recuperação chegam, os links funcionam uma única vez e o remetente não apresenta alerta de falsificação.

### Passo 7 — Publicar o primeiro estabelecimento no diretório

A busca pública está funcionando, mas retorna vazia porque ainda não há perfil publicado que atenda aos critérios.

1. Entre no painel com uma loja real de teste.
2. Confirme o e-mail da conta.
3. Preencha nome, descrição, telefone, endereço, cidade, estado e CEP.
4. Cadastre ao menos um serviço, horários e, se aplicável, profissional.
5. Adicione uma imagem real e confira se ela abre pelo R2.
6. Confirme no mapa a posição do estabelecimento.
7. Marque o consentimento de publicação.
8. Envie para análise e aprove/publice pelo fluxo administrativo.
9. Busque em `/explorar` perto das coordenadas cadastradas.
10. Faça uma reserva com um segundo usuário e teste disputa do mesmo horário.

**Aceite:** o estabelecimento aparece por raio e serviço; a página pública abre; a reserva entra na agenda sem duplicidade de horário.

### Passo 8 — Colocar o R2 em formato definitivo de produção

O R2 funciona, mas utiliza o endereço público de desenvolvimento `r2.dev`, que a Cloudflare trata como opção limitada e não ideal para produção.

Opção recomendada:

1. Criar `media.agentegestor.com.br` como domínio de mídia no Cloudflare R2.
2. Como o DNS atual não está hospedado na Cloudflare, planejar a entrada do domínio na Cloudflare sem apagar registros existentes.
3. Exportar/copiar antes todos os registros DNS, principalmente site, e-mail, SPF, DKIM, DMARC e verificações da Meta/Google.
4. Alterar nameservers somente em janela acompanhada e depois de comparar os registros.
5. Associar o domínio ao bucket e atualizar `MEDIA_PUBLIC_URL`.
6. Validar as imagens antigas e novas.

Opção temporária: continuar com `r2.dev` enquanto houver pouco tráfego, aceitando limitação e deixando a troca registrada como pendência.

**Aceite:** imagens usam domínio definitivo, uploads antigos continuam acessíveis e nenhum serviço de e-mail ou verificação externa foi quebrado pela mudança de DNS.

### Passo 9 — Backups externos e monitoramento

O ensaio de restauração foi aprovado, mas o backup atual está no mesmo VPS. Isso não protege contra perda total do servidor.

1. Criar um bucket **privado** separado para backups; não usar o bucket público de imagens.
2. Configurar `pg_dump` diário criptografado e envio para esse destino.
3. Adotar retenção sugerida: 7 diários, 4 semanais e 6 mensais.
4. Não guardar a chave de descriptografia somente no VPS.
5. Agendar teste de restauração mensal em banco separado.
6. Monitorar `https://agentegestor.com.br/api/health` a cada 1–5 minutos.
7. Criar alertas para disco acima de 80%, contêiner reiniciando, banco/Redis indisponível e certificado perto de vencer.
8. Revisar o firewall: público apenas 80/443; SSH restrito por IP quando viável.
9. Após confirmar que o acesso por chave funciona para todos os administradores, desabilitar login SSH por senha e considerar desabilitar login direto de root.
10. Excluir o banco temporário `agt_restore_ensaio_20261016` somente depois de guardar a evidência do teste.

**Aceite:** existe backup fora do VPS, um segundo restore é executável, alertas chegam a um responsável e o procedimento de recuperação está documentado.

## 4. Teste final antes de abrir para clientes

Executar em navegador e em Android real:

- cadastro, confirmação de e-mail, login e recuperação de senha;
- criação da loja, serviços, profissionais, horários e bloqueios;
- upload, exibição e exclusão de imagem;
- publicação no diretório, filtro por raio e reserva;
- duas tentativas simultâneas para o mesmo horário;
- mapa com permissão concedida e negada;
- compra/restauração pela Play e checkout/cancelamento pelo Stripe;
- WhatsApp oficial: autorização, mensagem recebida, resposta, pausa e reconexão;
- exclusão da conta, incluindo cancelamento da assinatura e remoção das imagens;
- funcionamento com rede instável e retorno após fechar o aplicativo;
- conferência de logs sem tokens, senhas ou dados sensíveis.

## 5. O que não deve ser feito

- Não executar o deploy antigo baseado em SQLite sobre a produção atual.
- Não executar `docker compose down -v`; isso pode remover volumes de dados.
- Não reinstalar nem redefinir o VPS pelo painel da Hostinger.
- Não enviar `.env`, tokens, chaves privadas, JSON de conta de serviço ou códigos OAuth pelo chat.
- Não colocar token secreto Mapbox em variável `VITE_*`.
- Não alterar nameservers sem copiar e comparar todos os registros DNS.
- Não considerar `configured_not_verified` como integração homologada.
- Não excluir os backups SQLite locais nem o banco de ensaio antes do encerramento formal da migração.
- Não usar a conexão WhatsApp não oficial como fallback silencioso em produção.

## 6. Ordem prática recomendada

1. **Hoje:** renovar o VPS e conferir o estado da verificação Meta.
2. **Em seguida:** criar os dois tokens Mapbox e autorizar o uso permanente.
3. **Depois:** publicar o novo build com mapa e fazer o primeiro perfil real do diretório.
4. **Com um Android disponível:** testar Meta/WhatsApp e Google Play.
5. **Na homologação comercial:** testar e-mail e Stripe.
6. **Antes de divulgação:** configurar backup externo, monitoramento e domínio definitivo do R2.
7. **Por último:** executar toda a lista de aceite e abrir gradualmente para poucos clientes.

## 7. Informações que o proprietário deve retornar

Não retorne segredos. Basta informar:

- “VPS renovado” e a nova data de validade;
- estado textual da verificação da Meta;
- “tokens Mapbox criados e configurados em local seguro”;
- escolha para mídia: domínio próprio agora ou `r2.dev` temporário;
- conta/faixa Play usada para teste;
- resultado dos testes de e-mail, Stripe, Play e WhatsApp;
- horário disponível para o teste acompanhado no Android.

Com essas confirmações, o restante pode ser aplicado e verificado tecnicamente sem repetir a migração já concluída.
