# WhatsApp oficial — operação e ativação

O código implementa Embedded Signup com coexistência. **A integração não fica ativa apenas ao publicar o código.** O negócio precisa de um aplicativo Meta, permissões aprovadas, configuração de Facebook Login for Business com WhatsApp Embedded Signup e elegibilidade para coexistência.

## Configuração do servidor

- `META_APP_ID`: ID do app Meta.
- `META_APP_SECRET`: segredo do app; nunca expor ao cliente.
- `META_SIGNUP_CONFIG_ID`: configuração de Embedded Signup para coexistência.
- `META_WEBHOOK_VERIFY_TOKEN`: segredo aleatório da verificação de callback global.
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`: chave de 32 bytes, representada por 64 caracteres hexadecimais. Fazer backup seguro; perder esta chave exige reconectar os números. Não trocar sem migrar os tokens criptografados.
- `META_GRAPH_VERSION`: versão Graph aprovada para o app; padrão `v23.0`.

Callback HTTPS no painel Meta: `/api/webhook/meta`. Assinar `messages` e os campos de coexistência exigidos pela configuração da Meta. Eventos de histórico/echo não acionam o bot.

Configurar domínio do aplicativo, política de privacidade, exclusão de dados, URLs de redirecionamento e permissões `whatsapp_business_management` e `whatsapp_business_messaging`. A autorização recebida pelo servidor precisa incluir o WABA em `granular_scopes`; falta de acesso é recusada.

## Banco e publicação

Não executar contra o banco de produção sem backup consistente. A alteração é aditiva no domínio: novos campos oficiais e tabelas de state, inbox, conversa, delivery e leases.

1. Parar a instância anterior e fazer backup consistente do SQLite (inclusive WAL se utilizado).
2. Gerar o cliente Prisma e revisar/aplicar o schema atualizado via procedimento de migração da instalação. O projeto ainda utiliza `prisma db push`; revisar o diff antes de aplicar e nunca usar `--accept-data-loss`.
3. Publicar servidor e frontend juntos e configurar os segredos.
4. Verificar `/api/health` e confirmar o callback no painel Meta.
5. Executar onboarding com uma conta WhatsApp Business elegível e testar recebimento, agendamento, envio, pausa, reconexão e coexistência no Android real.

Os testes criam cópias descartáveis do banco e aplicam o schema nessas cópias. O banco local e o servidor em produção não foram alterados por esses testes.

## Contrato HTTP

- `GET /api/whatsapp/official/status`: configuração pública, identidade/status da conexão, contagens de eventos com falha e em processamento. Não inicia autorização.
- `GET /api/whatsapp/official/config`: gera state de uso único, vinculado à loja, válido por 10 minutos; requer plano válido.
- `POST /api/whatsapp/official/connect`: `{code,state,wabaId,phoneId?}`. Troca OAuth só no servidor; valida app, escopos, WABA e propriedade do número; se phoneId ausente exige exatamente um número no WABA.
- `DELETE /api/whatsapp/official/disconnect`: revoga a conexão local, remove o token, pausa o bot e cancela eventos locais pendentes. Não cancela indiscriminadamente a inscrição do WABA compartilhado com outros números.

`connection.connected` significa autorização registrada e ainda válida. Não significa entrega de mensagem nem comprova que o número passou por todas as exigências comerciais da Meta.

## Entrega e recuperação

Mensagens recebidas são persistidas antes do ACK HTTP; redelivery da Meta é deduplicada pelo message ID e loja. Um lease no SQLite serializa o worker entre instâncias que compartilham o mesmo banco. Conversas são persistidas e expiram após 24 horas. A implantação continua exigindo um único processo para reservas, pois o lock existente da agenda é em memória.

`accepted` confirma aceite da Graph, e os webhooks posteriores atualizam `sent`, `delivered`, `read` ou `failed`. Não transformar aceite em “entregue”. Erros da Meta 190 exigem nova autorização.

Timeouts e processos interrompidos podem ocorrer depois de um envio/pedido efetivamente ter sido aceito. Esses eventos ficam `failed`, visíveis nas contagens do painel, para conferência; não são repetidos automaticamente. Isso evita duplicar mensagens e reservas. A operação precisa conferir o evento, a conversa e o pedido antes de qualquer reprocessamento. Ainda não existe UI de reprocessamento individual.

Notificações fora da janela de atendimento de 24 horas exigem modelos aprovados pela Meta e opt-in aplicável. O código envia mensagens livres e informa falha quando a Meta recusa; não finge que modelos foram aprovados ou que uma mensagem chegou.

Não coletar tokens completos, códigos OAuth ou conteúdos de clientes em logs de aplicação. Proteger os backups do banco, pois conversas e mensagens contêm dados do atendimento.
