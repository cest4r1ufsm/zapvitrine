# Integrações e homologação do AGTGestor

Atualizado em 15/10/2026. O código local inclui a expansão nacional; o site publicado ainda responde com a versão antiga. A publicação exige migração planejada e serviços compartilhados. Não executar o antigo deploy SQLite sobre a base nacional.

## Primeiro passo

Concluir a verificação da conta Meta Developers no painel lateral. A sessão observada continua em Verify account, com confirmação por SMS pendente. Digitar qualquer código diretamente no painel, nunca no chat. Se não chegar, conferir o número completo e as alternativas que a própria Meta oferecer; reenvio repetido não comprova envio nem aprovação. Criar o portfólio empresarial depois que a conta permitir. A restrição anterior de conta muito nova não foi novamente comprovada nesta auditoria.

Decisão de 15/10/2026: começar no VPS atual, com PostgreSQL/PostGIS e Redis privados, API e worker separados. Preparar expansão sem contratar infraestrutura completa de nuvem agora. Backups externos e mídia compatível com S3 precisam de destino confirmado; não foram contratados. O projeto contém infraestrutura AWS preparada, mas não há evidência de implantação. PostgreSQL/PostGIS, Redis TLS e imagens compartilhadas são requisitos do código de produção; não são substituídos por um teste SQLite aprovado.

## Ordem de configuração

| Etapa | Onde agir | Configurar | Evidência de conclusão |
|---|---|---|---|
| Hospedagem e domínio | Conta que administra o VPS ou ambiente AWS escolhido | Acesso autenticado, domínio HTTPS canônico e homologação separada | Versão implantada identificável, saúde 200 e rollback ensaiado |
| Banco | PostgreSQL com PostGIS no VPS inicialmente | Usuário de migração separado do runtime, SSL, backups, migrations 001 a 005 | Verificação de integridade, importação ensaiada e restauração em banco separado |
| Limites compartilhados | Redis com TLS | REDIS_URL em segredo de runtime, autenticação e rede privada/autorizada | Duas instâncias compartilham limites; falha do Redis não libera operações sem controle |
| Imagens | S3/CDN ou destino compatível com o adapter implementado | MEDIA_STORAGE, MEDIA_BUCKET, MEDIA_PUBLIC_URL, AWS_REGION e role mínima | Envio, leitura pública intencional e exclusão de imagem sintética |
| Meta | Meta Developers e portfólio empresarial | App, permissões WhatsApp, Tech Provider quando aplicável, Login for Business Embedded Signup e callback | Número Business elegível conectado no mesmo Android, webhook assinado e mensagem recebida |
| Mapa | Conta Mapbox | Token público restrito ao domínio no build; token privado de geocodificação no servidor | Mapa real, limites de gasto e geocodificação permanente autorizada |
| E-mail | Provedor SMTP atual | Remetente e domínio verificados, SPF/DKIM conforme provedor | Cadastro e recuperação chegam ao destinatário autorizado e abrem o fluxo correto |
| Site pago | Stripe | Ambiente/preço e assinatura do webhook | Checkout, cancelamento e eventos atrasados testados no modo de teste |
| App pago | Play Console e Google Cloud | Conta de serviço com acesso ao app, produto/plano e faixa de testes | Compra, restauração, expiração e cancelamento conferidos no aparelho |

## Meta passo a passo

1. Concluir a conta de desenvolvedor e o portfólio empresarial com dados reais do responsável e do negócio. Não usar nome da marca para inventar identidade pessoal.
2. Criar/configurar o app empresarial para WhatsApp e seguir as verificações e permissões exigidas no painel. A aprovação é da Meta.
3. Configurar domínio `agentegestor.com.br`, política `/privacidade`, termos `/termos` e instruções de exclusão `/excluir-conta`. Confirmar os URLs de OAuth exigidos pela configuração, sem inventar URLs que o app não atende.
4. Criar a configuração de Login for Business com Embedded Signup/coexistência e guardar o ID público; configurar os valores privados somente no servidor/gerenciador de segredos.
5. Configurar callback `https://agentegestor.com.br/api/webhook/meta` depois da publicação. O token de verificação deve ser o mesmo no painel e no servidor; HMAC usa o App Secret. Assinar os eventos necessários, incluindo mensagens e coexistência conforme o painel/documentação atual.
6. Conectar WhatsApp Business elegível, autorizar e confirmar no aplicativo. Conferir entrada de mensagem, catálogo com mais de dez itens, reserva, pausa, atendimento manual e reautorização.
7. Para notificações fora da janela de atendimento, criar modelos no WhatsApp Manager e testar aprovação, categoria, idioma e consentimento aplicáveis. A aplicação ainda não oferece gestão completa de templates nem deve fingir que mensagens livres sempre serão aceitas.

## Diagnóstico sem expor credenciais

No diretório `server`, executar `node scripts/check-integrations.js`. A saída mostra nomes de configurações ausentes e o teste real necessário; não imprime valores de segredo. `configured_not_verified` significa somente presença da configuração, nunca aprovação do provedor. Executar no ambiente de destino: o diagnóstico local não revela a configuração do VPS.

Não colar arquivos .env, tokens, chaves JSON ou códigos OAuth no chat. Configurá-los diretamente no provedor/servidor pelo canal autorizado.

## Aceite antes de liberar clientes

Validar no Android instalado: cadastro e confirmação, login após rede cair, retorno do e-mail, reserva com dois usuários no mesmo horário, fuso do estabelecimento, mapa/localização, compra/restauração, WhatsApp no mesmo aparelho, pausa e retomada. Testar sem permissões opcionais, sem mapa/rede e com serviços externos indisponíveis.

Ensaiar backups/restauração, indisponibilidade de Redis/banco e falha de worker. Examinar mensagens failed antes de repetir: um resultado ambíguo pode já ter enviado resposta ou criado reserva. O código não promete entrega por receber aceite do provedor.

A aprovação local não substitui homologação externa, carga de produção, failover ou acompanhamento operacional. Nenhum serviço pago foi contratado nesta auditoria.

