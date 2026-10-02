# AGTGestor na Play Console — respostas prontas

Conta: VEREDA APP INOVA SIMPLES (I.S), id 7780697011136579134.
Arquivo para enviar: `android-twa/app/build/outputs/bundle/release/app-release.aab`.

## 1. Criar app

| Campo | Resposta |
|---|---|
| Nome do app | AGTGestor: Agenda de Serviços |
| Idioma padrão | Português (Brasil) – pt-BR |
| App ou jogo | App |
| Gratuito ou pago | Gratuito (a assinatura é vendida dentro do app) |
| Pacote (vem do AAB) | br.com.agentegestor.app |

## 2. Configurar o app (Painel > "Configure seu app")

| Item | Resposta |
|---|---|
| Política de privacidade | https://agentegestor.com.br/privacidade |
| Acesso ao app | Algumas funções exigem login → informar a conta de revisor (ver item 6) |
| Anúncios | Não, o app não contém anúncios |
| Classificação do conteúdo | Categoria "Todos os outros tipos de app". Responder Não a violência, sexo, linguagem, drogas, jogos de azar. Interação entre usuários: Não (o robô fala com os clientes do negócio, não entre usuários do app). Compartilha localização: Não. Compras digitais: Sim |
| Público-alvo | 18 anos ou mais |
| App de notícias | Não |
| Apps governamentais | Não |
| Recursos financeiros | Nenhum |
| Saúde | Nenhum |
| ID de publicidade | Não usa |
| Exclusão de conta (URL) | https://agentegestor.com.br/excluir-conta |

### Segurança dos dados

- Coleta dados? **Sim**. Compartilha com terceiros? **Não** (Stripe, Google, hospedagem e e-mail são prestadores de serviço, não contam como compartilhamento).
- Criptografia em trânsito: **Sim**. O usuário pode pedir exclusão: **Sim** (no app e na URL acima).
- Login: e-mail e senha.

| Tipo de dado | Coletado | Obrigatório | Finalidade |
|---|---|---|---|
| Informações pessoais > Nome | Sim | Sim | Funcionalidade do app, Gerenciamento da conta |
| Informações pessoais > Endereço de e-mail | Sim | Sim | Funcionalidade do app, Gerenciamento da conta, Comunicações do desenvolvedor |
| Informações pessoais > Número de telefone | Sim | Não | Funcionalidade do app |
| Informações pessoais > Endereço | Sim | Não | Funcionalidade do app |
| Informações financeiras > Histórico de compras | Sim | Não | Funcionalidade do app (situação da assinatura) |
| Fotos e vídeos > Fotos | Sim | Não | Funcionalidade do app (logo e fotos dos serviços) |

Tudo o mais: Não coletado. Nenhum dado é processado só de forma temporária.

## 3. Ficha da loja

- **Descrição curta (80):** Agenda, clientes e atendimento automático para salões, clínicas e serviços.
- **Descrição completa:**

> O AGTGestor organiza a rotina do seu negócio de serviços em um só lugar.
>
> • Agenda por profissional, com horários livres calculados sozinhos
> • Cadastro de serviços com preço, duração e intervalo
> • Clientes registrados automaticamente a cada agendamento
> • Bloqueio de folgas, feriados e horários de almoço
> • Loja online com seus serviços para compartilhar o link
> • Robô que responde seus clientes no WhatsApp e marca horários 24 horas
>
> Feito para salões, barbearias, estúdios, clínicas e outros pequenos negócios.
>
> Teste grátis por 7 dias. Depois, assinatura mensal dentro do app pelo Google Play. Cancele quando quiser.
>
> O AGTGestor não é afiliado ao WhatsApp nem à Meta.

- **Categoria:** Empresa. **Tags:** agenda, produtividade.
- **E-mail de contato:** contato@agentegestor.com.br. **Site:** https://agentegestor.com.br
- **Ícone 512×512:** `android-twa/store/icon-512.png`
- **Gráfico 1024×500 e prints 9:16:** ainda não feitos (fazer com a conta de revisor já logada).

## 4. Assinatura (Monetizar > Produtos > Assinaturas)

| Campo | Valor |
|---|---|
| ID do produto | `agtgestor_premium_mensal` (o código usa este nome; não mudar) |
| Nome | AGTGestor Premium |
| Plano básico (ID) | `mensal` — renovação automática, a cada 1 mês |
| Preço | R$ 27,99 (a Play só aceita centavos ,99 em BRL) |
| Países | Brasil |
| Teste grátis na Play | Não (a conta já ganha 7 dias grátis no cadastro) |

Ativar o plano básico (o botão só habilita depois de recarregar a página).

## 5. Conta de serviço (para o servidor conferir as compras)

1. Usuários e permissões > Convidar: a mesma conta de serviço do Sonus (ou uma nova do Google Cloud) com "Ver informações do app", "Ver dados financeiros" e "Gerenciar pedidos e assinaturas", no app AGTGestor.
2. Baixar a chave JSON dessa conta no Google Cloud e copiar para o servidor em `/var/www/pedidoprontobot/server/play-service-account.json`.
3. No `.env` do servidor: `PLAY_SERVICE_ACCOUNT_FILE=/var/www/pedidoprontobot/server/play-service-account.json`.

## 6. Conta do revisor

No servidor: `cd /var/www/pedidoprontobot/server && node scripts/create-reviewer.js revisor.googleplay@agentegestor.com.br <senha>`
Informar esse e-mail e senha em "Acesso ao app".

## 7. Versões

Teste interno primeiro (lista de testadores já existente). Depois de publicar:
Integridade do app > Assinatura do app > copiar o SHA-256 da **chave de assinatura do app** e somar em
`client/public/.well-known/assetlinks.json` (a do envio já está lá). Publicar o site de novo.
Países da produção: Brasil.
