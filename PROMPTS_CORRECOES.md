# Prompts de Correção — AGTgestor (Auditoria 16/07/2026)

## Como usar

- Execute **um prompt por vez**, em sessão nova do Claude Code, com a pasta de trabalho na raiz do repositório (`produto_extra_0107_ok/produto_extra/produto_extra`).
- Cole o **PREÂMBULO PADRÃO** junto com cada prompt.
- Ordem recomendada de execução: **2 → 8 → 4 → 1 → 3 → 6 → 5 → 7 → 9 → 14 → 15 → 11 → 10 → 12 → 13 → demais**.

## PREÂMBULO PADRÃO (colar antes de cada prompt)

> Você está no repositório do AGTgestor (SaaS de agendamento via WhatsApp: Express 5 + Prisma/SQLite em `server/`, React 19 + Vite em `client/`). Produção roda num VPS Hostinger (Ubuntu 24, PM2 app `pedido-pronto-bot`, caminho `/var/www/pedidoprontobot`, domínio https://agentegestor.com.br). Regras: (1) não quebre nenhum comportamento existente; (2) leia cada arquivo antes de editar; (3) se alterar o client, rode `npm run build` em `client/` e confirme que o build passa; (4) faça um commit separado por arquivo alterado, com mensagem descritiva em inglês no padrão conventional commits; (5) ao final, faça push para `origin main` e me entregue os comandos exatos para aplicar no VPS (git pull, prisma db push se houve mudança de schema, build, pm2 restart); (6) não invente variáveis de ambiente — se precisar de uma nova, me instrua a adicioná-la nos dois `.env` (local e VPS); (7) teste o que for testável localmente antes de commitar.

---

## 🔴 CRÍTICOS

### PROMPT 1 — Paywall no backend (enforcement de assinatura)

O paywall do chatbot existe apenas no frontend (`client/src/pages/Dashboard.jsx` linha ~1456). Nenhuma rota do servidor valida assinatura. Implemente enforcement real:

1. Crie `server/src/middleware/premium.js` exportando `requirePremium`: busca a store do `req.user.id` via Prisma; permite acesso se `subscriptionStatus === 'active'` (se o campo `trialEndsAt` existir no schema e estiver no futuro, permita também — integração com o prompt 11); caso contrário responda `403` com `{ error: 'Assinatura necessária para usar este recurso', code: 'SUBSCRIPTION_REQUIRED' }`. Anexe a store em `req.store` para evitar query duplicada na rota.
2. Aplique `requirePremium` nas três rotas de `server/src/routes/whatsapp.js` (`/connect`, `/status`, `/disconnect` — status pode permanecer livre se preferir, mas `/connect` é obrigatório).
3. Em `server/src/services/whatsapp.js`: (a) `startSession` deve verificar a assinatura da store antes de conectar e lançar erro se não for elegível; (b) `restoreSessions` deve pular stores sem assinatura ativa/trial válido; (c) no handler `connection === 'open'`, só gravar `botEnabled: true` se a store for elegível.
4. Em `server/src/routes/stripe-webhook.js`, no evento `customer.subscription.deleted`, além de `botEnabled: false`, chame `stopSession(storeId)` para derrubar a sessão Baileys ativa imediatamente (importe do serviço; cuidado com require circular — se houver, use require tardio dentro do handler).
5. Não altere o comportamento do frontend (o paywall visual continua).

Critérios de aceite: usuário com `subscriptionStatus` ≠ active recebe 403 em `POST /api/whatsapp/connect` (teste com curl + JWT de conta free); usuário ativo conecta normalmente; após cancelamento via webhook, a sessão cai e reconectar retorna 403; `pm2 restart` não restaura sessões de stores inativas.

---

### PROMPT 2 — Rotação e blindagem do JWT_SECRET

O `JWT_SECRET` atual é um placeholder previsível ("zapvitrine-secret-key-change-in-production-2026") que já foi exposto em screenshots. Corrija:

1. Gere um segredo novo de 64 bytes hex (use `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) e atualize o `.env` local (`server/.env`).
2. Adicione um guard de inicialização em `server/src/index.js`, antes do `app.listen`: se `process.env.JWT_SECRET` estiver ausente, tiver menos de 32 caracteres, ou for igual à string antiga conhecida, logue erro claro e encerre o processo com `process.exit(1)`. Isso impede o app de subir inseguro por engano.
3. Me entregue o comando `sed` pronto para atualizar o `.env` do VPS com o novo segredo + `pm2 restart`.
4. Documente no final: todos os tokens JWT existentes serão invalidados — usuários logados precisarão fazer login novamente (aceitável, comunicar se necessário).

Critérios de aceite: app local sobe com o novo segredo; app se recusa a subir com o segredo antigo; login funciona e gera token válido com o novo segredo.

---

### PROMPT 3 — Blindagem do upload de imagens (anti stored-XSS) + otimização

`server/src/middleware/upload.js` valida apenas o mimetype declarado pelo cliente (falsificável) e preserva a extensão original do arquivo — permitindo salvar `.html` disfarçado de imagem e servi-lo via `/uploads` como página no nosso domínio (XSS armazenado que rouba o JWT do localStorage). Corrija em profundidade:

1. Em `upload.js`: crie um mapa `mimetype → extensão` (`image/jpeg→.jpg`, `image/png→.png`, `image/webp→.webp`, `image/gif→.gif`); no `filename`, ignore completamente `file.originalname` e use `Date.now()-random + extensão do mapa`; no `fileFilter`, rejeite se o mimetype não estiver no mapa **e também** se a extensão original (lowercase) não estiver em `['.jpg','.jpeg','.png','.webp','.gif']` (defesa dupla).
2. Instale `sharp` no server. Crie um pós-processamento (função utilitária ou middleware após o multer) que: reencoda a imagem (o que destrói qualquer payload não-imagem — se o sharp falhar ao decodificar, delete o arquivo e retorne 400 "Arquivo não é uma imagem válida"), redimensiona para no máximo 1200px de largura mantendo proporção, converte para WebP qualidade 82 (exceto GIF animado — detecte com metadata `pages > 1` e mantenha como está), remove metadados EXIF. Aplique nos três pontos de upload: logo e banner em `server/src/routes/store.js`, imagem de produto em `server/src/routes/products.js`.
3. Em `server/src/index.js`, no `express.static` de `/uploads`, adicione `setHeaders` com `X-Content-Type-Options: nosniff` e `Content-Security-Policy: default-src 'none'`.
4. Atenção: `sharp` tem binários nativos — inclua no passo de deploy a instrução `npm install` no server do VPS.

Critérios de aceite: upload de arquivo HTML renomeado com mimetype de imagem é rejeitado; JPEG de 4MB vira WebP ≤1200px; GIF animado continua animado; logos/banners/produtos existentes continuam sendo servidos.

---

### PROMPT 4 — Backup automático do banco SQLite e uploads

O banco de produção é um único arquivo SQLite (`/var/www/pedidoprontobot/server/prisma/dev.db`) sem nenhum backup. Crie a solução completa (os artefatos são para o VPS — gere os arquivos no repo em `deploy/` e me dê os comandos de instalação):

1. Crie `deploy/backup-agtgestor.sh`: usa `sqlite3 <db> ".backup '/var/backups/agtgestor/db-$(date +%F-%H%M).db'"` (backup online consistente, NUNCA `cp` simples), comprime com gzip, apaga backups com mais de 14 dias (`find -mtime +14 -delete`), e uma vez por semana (ex.: domingo) faz `tar czf` da pasta `server/uploads` com a mesma retenção. O script deve criar `/var/backups/agtgestor` se não existir e logar em `/var/log/agtgestor-backup.log`.
2. Me entregue os comandos para o VPS: instalar `sqlite3` (`apt install sqlite3`), copiar o script para `/usr/local/bin`, `chmod +x`, e registrar no cron do root: `0 3 * * * /usr/local/bin/backup-agtgestor.sh`.
3. Inclua no script um teste de integridade: após o backup, rode `sqlite3 <arquivo> "PRAGMA integrity_check;"` e logue o resultado; se falhar, não delete backups antigos nessa execução.
4. Documente em `deploy/RESTORE.md` o procedimento de restore passo a passo (parar PM2, substituir o arquivo, `pm2 restart`) e recomende fortemente configurar `rclone` para copiar `/var/backups/agtgestor` para um destino externo (Google Drive/Backblaze), com o comando exemplo.

Critérios de aceite: rodar o script manualmente no VPS gera o arquivo, o integrity_check retorna `ok`, e o cron está registrado (`crontab -l`).

---

## 🟠 ALTOS

### PROMPT 5 — Validar assinatura do webhook da Meta (Cloud API)

`POST /api/webhook/:storeId` em `server/src/routes/webhook.js` processa qualquer JSON sem validar a assinatura `X-Hub-Signature-256` que a Meta envia — qualquer um pode forjar mensagens, criar pedidos falsos e fazer o bot disparar mensagens (custo + risco de ban). Corrija:

1. Em `server/src/index.js`, altere `app.use(express.json())` para `app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }))` — a validação HMAC exige o corpo bruto exato.
2. Em `webhook.js`, no handler POST, antes de qualquer processamento: leia `process.env.META_APP_SECRET`; calcule `crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')`; compare com o header `x-hub-signature-256` (formato `sha256=<hex>`) usando `crypto.timingSafeEqual` (atenção: buffers de mesmo tamanho, trate exceção). Assinatura inválida ou ausente → `401` sem processar. Corrija também o comentário errado em `index.js` que chama essa rota de "Webhook da Kiwify" — é o webhook da WhatsApp Cloud API.
3. Compatibilidade: se `META_APP_SECRET` não estiver definido no `.env`, logue um warning claro a cada boot ("webhook Meta SEM validação de assinatura") e mantenha o comportamento atual — assim nada quebra até a variável ser configurada. Me instrua onde encontrar o App Secret no painel da Meta (App Dashboard → Settings → Basic) e a adicioná-lo nos dois `.env`.
4. Mantenha o GET de verificação (`hub.challenge`) intacto.

Critérios de aceite: com o secret configurado, POST sem assinatura ou com assinatura errada recebe 401 e não cria pedido; POST com assinatura correta funciona; sem o secret configurado, warning no log e comportamento atual preservado.

---

### PROMPT 6 — Rate limiting nas rotas sensíveis

Nenhuma rota tem limite de requisições: login aceita brute force ilimitado, e `/forgot-password` + `/resend-verification` permitem bombardear emails de terceiros e queimar a cota diária do Brevo (300/dia), derrubando os emails de clientes reais. Implemente:

1. Instale `express-rate-limit` no server.
2. Em `server/src/index.js`, adicione `app.set('trust proxy', 1)` (estamos atrás de proxy reverso — sem isso o rate limit veria todos os requests com o mesmo IP interno). Verifique antes como o tráfego chega ao Node no VPS para confirmar que há exatamente 1 proxy.
3. Crie `server/src/middleware/rateLimits.js` com limiters nomeados, todos com resposta 429 JSON em pt-BR (`{ error: 'Muitas tentativas. Aguarde alguns minutos.' }`): `loginLimiter` 5 req/15min por IP; `registerLimiter` 10 req/hora por IP; `emailLimiter` 3 req/hora por IP (aplicar em forgot-password E resend-verification); `apiLimiter` 300 req/15min por IP como teto geral.
4. Aplique: limiters específicos nas rotas correspondentes de `server/src/routes/auth.js`; `apiLimiter` em `app.use('/api', ...)` em `index.js`, **exceto** nas rotas de webhook (`/api/webhook/stripe` e `/api/webhook`) — webhooks legítimos têm burst e já têm validação própria de assinatura.
5. Cuidado com a ordem de montagem em `index.js`: o webhook da Stripe é montado antes do `express.json()` — preserve isso.

Critérios de aceite: 6ª tentativa de login em sequência retorna 429; webhook Stripe não é afetado (teste com o Stripe CLI ou confira que a rota não passa pelo limiter); app builda e sobe normalmente.

---

### PROMPT 7 — Fechar vazamento de dados no endpoint público da loja

`GET /api/public/store/:slug` em `server/src/routes/public.js` remove campos sensíveis por **blacklist** (destructuring) e esqueceu vários: expõe publicamente `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `plan`, `botEnabled` e `botGreeting`. Corrija trocando para **whitelist**:

1. Antes de mudar, faça grep em `client/src/pages/PublicStore.jsx` (e qualquer outro consumidor de `publicAPI.getStore`) e liste TODOS os campos da store que o frontend realmente usa — a whitelist deve cobrir exatamente esses campos e nada além.
2. Reescreva a query com `select:` explícito do Prisma em vez de `include` + destructuring. Baseline esperada (confirme com o grep): `id, name, slug, description, phone, address, logoUrl, bannerUrl, themeColor, businessHours, active`, mais `categories` (id, name, order) e `products` ativos (id, name, description, price, imageUrl, categoryId, order, category {id, name}, e `duration` se a página exibir). Não inclua nenhum campo `bot*`, `stripe*`, `subscription*`, `plan`, `userId`, `schedulingConfig`.
3. Mantenha o check `!store.active → 404`.
4. Rode o build do client e abra mentalmente o fluxo da loja pública para garantir que nenhum campo usado sumiu (se o frontend usar algum campo que caiu fora, inclua-o conscientemente na whitelist).

Critérios de aceite: `curl /api/public/store/<slug>` não retorna nenhum campo stripe/bot/plan; a página pública da loja renderiza idêntica ao estado atual.

---

### PROMPT 8 — Fechar exposição direta da porta 3001 (firewall + bind)

O Express escuta em todas as interfaces na porta 3001. Se o firewall do VPS não bloquear, a API inteira fica acessível em `http://187.77.253.142:3001` sem HTTPS. Esta tarefa é majoritariamente operacional — me guie e gere o necessário:

1. Primeiro, diagnóstico: me dê os comandos para eu rodar no VPS e te trazer o resultado — `ufw status verbose`, `ss -tlnp | grep 3001`, e como o domínio chega ao Node (`nginx -T 2>/dev/null | grep -A5 'proxy_pass'` ou equivalente; pode ser Nginx, Caddy ou outro). Aguarde minha resposta antes do passo 2.
2. Com o diagnóstico em mãos: se houver proxy reverso local (esperado), altere `server/src/index.js` para `app.listen(PORT, process.env.HOST || '127.0.0.1', ...)` — binding em loopback é a defesa definitiva; a variável `HOST` permite override em dev (`HOST=0.0.0.0` no `.env` local se eu precisar acessar de outro dispositivo na rede).
3. Me entregue os comandos de firewall: `ufw allow OpenSSH`, `ufw allow 80/tcp`, `ufw allow 443/tcp`, `ufw enable` (com aviso sobre manter a sessão SSH aberta ao ativar) — com o bind em 127.0.0.1, nem precisamos de regra deny explícita para a 3001, mas inclua por camada extra.
4. Verificação final: `curl -m 5 http://187.77.253.142:3001/api/public/store/x` de fora deve falhar (timeout/refused); `https://agentegestor.com.br` deve continuar funcionando.

Critérios de aceite: porta 3001 inacessível externamente; site e API funcionando via domínio; WhatsApp/Baileys reconecta após o restart.

---

### PROMPT 9 — Nunca devolver o botToken da Meta ao frontend

`GET /api/store/chatbot` em `server/src/routes/store.js` retorna o `botToken` da Cloud API em texto claro para o navegador — combinado com qualquer XSS, o token da Meta vaza. Torne-o write-only:

1. No GET `/chatbot`: remova `botToken` do `select`; em vez dele, retorne `botTokenSet: boolean` (se há token salvo) e `botTokenLast4: string|null` (últimos 4 caracteres, para o usuário conferir qual token está ativo). Faça o mesmo tratamento para `botWebhookToken` se ele for sensível no seu fluxo (avalie: ele é um verify token que o próprio usuário digita na Meta — pode continuar visível; decida e justifique no commit).
2. No PUT `/chatbot`: só atualize `botToken` quando vier string não-vazia no body (já é o comportamento com o spread condicional — confirme); nunca ecoe o token de volta na resposta — retorne os mesmos campos mascarados do GET.
3. No frontend, localize o componente da página Chatbot (está dentro de `client/src/pages/Dashboard.jsx` — procure `ChatbotPage`) e ajuste: o input do token mostra placeholder `••••••••` + "termina em XXXX" quando `botTokenSet` for true, e só envia o campo se o usuário digitar um valor novo.
4. O webhook (`server/src/routes/webhook.js`) lê o token direto do banco — não é afetado. Confirme com grep que nenhum outro ponto do client depende de `botToken` cru.

Critérios de aceite: GET não contém o token; salvar um token novo funciona; salvar outras configs sem tocar no token não apaga o token existente; bot continua enviando mensagens.

---

## 🟡 MÉDIOS

### PROMPT 10 — TTL e resiliência do estado de conversas do bot

O estado das conversas vive em `Map`s em memória em dois lugares: `server/src/services/whatsapp.js` (linha ~226, fluxo Baileys) e `server/src/routes/webhook.js` (linha ~8, fluxo Cloud API). Problemas: nunca expiram (vazamento de memória), e todo `pm2 restart` derruba pedidos no meio da conversa. Implemente a correção mínima robusta:

1. Crie `server/src/utils/conversationStore.js`: uma classe/factory que encapsula o Map com `get/set/delete` e grava `lastActivity: Date.now()` em cada `set`. Um `setInterval` interno (a cada 5 min, com `.unref()` para não segurar o processo) remove conversas com mais de 30 minutos de inatividade. Exporte instâncias separadas (ou uma factory) para os dois consumidores.
2. Substitua os `Map`s crus nos dois arquivos pela nova abstração, mantendo as chaves (`storeId:phone`) e a semântica atual — a mudança deve ser transparente para o fluxo.
3. Comportamento na expiração: silencioso (não envie mensagem ao cliente — mensagens espontâneas assustam). Se o cliente responder depois de expirado, ele cai naturalmente no menu inicial, que é o fallback atual.
4. Adicione um log leve na limpeza (`X conversas expiradas removidas`) apenas quando remover algo.
5. NÃO tente persistir em banco nesta tarefa (fica para uma iteração futura) — mantenha o escopo em TTL + encapsulamento.

Critérios de aceite: conversa parada some após ~30min (teste reduzindo o TTL temporariamente em dev); fluxo de pedido completo continua funcionando nos dois canais; nenhum `setInterval` impede o processo de encerrar.

---

### PROMPT 11 — Implementar trial real com expiração

Hoje `plan` nasce como "trial" e `subscriptionStatus` como "free", mas nada expira — o produto é gratuito para sempre (junto com a falha do paywall frontend-only). Implemente trial de 7 dias de verdade:

1. Schema (`server/prisma/schema.prisma`): adicione `trialEndsAt DateTime?` no model `Store`. Rode `npx prisma db push` local e inclua o comando no deploy.
2. No registro (`server/src/routes/auth.js`, criação da store): defina `trialEndsAt: new Date(Date.now() + 7*24*60*60*1000)`.
3. Backfill: crie `server/scripts/backfill-trial.js` que seta `trialEndsAt = now + 7 dias` para stores existentes onde `trialEndsAt IS NULL` e `subscriptionStatus != 'active'` (dá 7 dias de cortesia a todo mundo na virada). Me instrua a rodá-lo uma vez no VPS após o deploy.
4. Middleware `requirePremium` (criado no prompt 1 — se ainda não existir, crie conforme aquele prompt): elegível se `subscriptionStatus === 'active'` OU (`trialEndsAt` não-nulo e no futuro). Resposta 403 deve distinguir: `code: 'TRIAL_EXPIRED'` vs `'SUBSCRIPTION_REQUIRED'`.
5. Webhook Stripe (`customer.subscription.deleted`): além do que já faz, sete `plan: 'free'` (hoje fica "premium" para sempre — inconsistência).
6. `GET /api/auth/me` deve retornar a store com `trialEndsAt` e `subscriptionStatus` para o frontend. Em `client/src/pages/BillingPage.jsx` e no paywall do `Dashboard.jsx`: mostre "Seu teste grátis termina em X dias" quando em trial, e o CTA de assinar quando expirado. `isPremium` no Dashboard passa a considerar trial válido também.

Critérios de aceite: conta nova tem 7 dias de bot funcionando; simular expiração (editar data no banco) bloqueia o connect com `TRIAL_EXPIRED`; assinar reativa; UI mostra os dias restantes.

---

### PROMPT 12 — Fazer o bot respeitar horário de funcionamento e mensagem de ausência

Os campos `businessHours` e `botAwayMessage` existem no schema e têm UI de configuração, mas **nunca são lidos** no fluxo do bot — o lojista configura e nada acontece. Implemente:

1. Primeiro, descubra o formato real de `businessHours`: grep em `client/src/pages/Dashboard.jsx` (StoreSettings) para ver como o campo é salvo (string livre? JSON?). Se for texto livre não-estruturado, use o `schedulingConfig` (JSON estruturado, ver `server/src/utils/availability.js` `parseConfig`) como fonte da verdade para horários, e trate `businessHours` apenas como texto exibido — documente a decisão.
2. Crie util `isStoreOpen(store): boolean` (em `server/src/utils/`, reutilizando `parseConfig` e a convenção de fuso BRT já existente em `availability.js` — servidor em UTC, BRT = UTC-3).
3. Nos dois fluxos de mensagens (`server/src/services/whatsapp.js` `handleIncomingMessage` e `server/src/routes/webhook.js` handler POST): quando a loja estiver fechada E não houver conversa em andamento, responda com `store.botAwayMessage` (fallback: "Olá! No momento estamos fechados. Nosso horário: ..." montado do config) em vez do menu, e não inicie fluxo novo. Conversas de pedido já em andamento podem concluir normalmente.
4. Anti-spam: guarde no estado de conversa (ver prompt 10) um flag `awayNotifiedAt` e não repita a mensagem de ausência para o mesmo cliente em menos de 6 horas.

Critérios de aceite: fora do horário configurado, cliente recebe a mensagem de ausência uma vez; dentro do horário, menu normal; pedido iniciado antes do fechamento conclui; loja sem config de horário se comporta como sempre aberta.

---

### PROMPT 13 — Integrar o bot ao sistema de agendamento estruturado (anti double-booking)

Hoje o bot salva `scheduledTime` como texto livre ("amanhã às 14h"), com `scheduledAt: null` e sem validar disponibilidade — permite double-booking e os pedidos não aparecem direito na agenda estruturada (`AgendaPage` usa `scheduledAt`). Existem utilitários prontos em `server/src/utils/availability.js` (`getAvailableDates`, `getAvailableSlots`, `buildScheduledAt`, `formatDateBR`, `getDayLabelBR`). Integre-os ao fluxo do bot Baileys (`server/src/services/whatsapp.js`):

1. No `handleOrderFlow`, caso `ask_type === schedule`: em vez de pedir texto livre, chame `getAvailableDates(prisma, store.id, convo.productId, null, 5)` e apresente as datas como lista numerada ("1 — Seg 21/07", ...). Novo step `choose_date`: guarda o `dateStr` escolhido e apresenta os slots daquela data numerados em colunas compactas ("1 — 09:00", ...). Novo step `choose_slot`: valida o número, monta `scheduledAt = buildScheduledAt(dateStr, slot)` e segue para `ask_notes`.
2. Em `saveOrder`: persista `scheduledAt` (estruturado) E `scheduledTime` (label legível "21/07 às 09:00") — assim agenda e listagens funcionam.
3. Revalidação anti-corrida: imediatamente antes do `prisma.order.create`, chame `getAvailableSlots` de novo para a data escolhida e confirme que o slot ainda está livre; se não estiver, informe o cliente e reapresente os slots da data.
4. Fallbacks: nenhuma data com slots → mantenha o fluxo antigo de texto livre (não bloqueie a venda); cliente digita algo fora da lista → mensagem de opção inválida (padrão existente).
5. Não altere o fluxo `delivery` (endereço). Não altere o fluxo do webhook Cloud API nesta tarefa (menor uso) — apenas o Baileys.
6. Atenção ao limite de mensagem do WhatsApp: se houver mais de ~12 slots, mostre em blocos ("envie + para ver mais horários") ou limite aos primeiros 12 com aviso.

Critérios de aceite: pedido agendado via bot aparece na AgendaPage no dia/hora certos; dois clientes não conseguem reservar o mesmo slot do mesmo serviço; loja sem `schedulingConfig` usa o padrão (9h-18h, ver `DEFAULT_CONFIG`); fluxo delivery inalterado.

---

### PROMPT 14 — Headers de segurança (helmet) + CORS restrito

O app usa `cors()` aberto e não envia nenhum header de segurança. Em `server/src/index.js`:

1. Instale `helmet`. Aplique `app.use(helmet({ ... }))` com CSP customizada compatível com a SPA React/Vite e os shaders WebGL: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'` (React usa inline styles); `img-src 'self' data: blob:`; `connect-src 'self'`; `font-src 'self' data:`; `frame-ancestors 'none'`; `object-src 'none'`. Adicione `crossOriginResourcePolicy: { policy: 'same-site' }` para não quebrar o carregamento de `/uploads`.
2. CORS: substitua `cors()` por `cors({ origin: [process.env.APP_URL, 'http://localhost:5007', 'http://localhost:3001'].filter(Boolean) })` — produção + dev do Vite.
3. Ordem: helmet e cors antes de todas as rotas, mas **preserve** o webhook da Stripe montado antes do `express.json()`.
4. Teste rigoroso: rode o build do client, sirva localmente pelo server (`node src/index.js` + abrir `http://localhost:3001`) e verifique no console do navegador que NADA foi bloqueado pela CSP — em especial a landing page (shaders WebGL, animações), o dashboard e a loja pública com imagens de `/uploads`. Se algo quebrar, ajuste a diretiva específica e documente o porquê no commit.

Critérios de aceite: `curl -I` mostra os headers (CSP, X-Frame-Options via frame-ancestors, nosniff etc.); zero erros de CSP no console em todas as páginas; requisição de origem estranha é bloqueada por CORS.

---

### PROMPT 15 — Parar de confiar no header Origin no checkout

Em `server/src/routes/billing.js` (linhas ~18 e ~33), as URLs `success_url`, `cancel_url` e `return_url` são montadas com `req.headers.origin` — header que pode vir ausente ou manipulado. Troque as três ocorrências por `process.env.APP_URL` (já existe no `.env`, valor `https://agentegestor.com.br`). Adicione um fallback defensivo: se `APP_URL` não estiver definido, logue erro e retorne 500 antes de chamar a Stripe (nunca monte URL `undefined/dashboard/billing`). Verifique com grep se `req.headers.origin` é usado em mais algum lugar do server e corrija igual. Teste: fluxo de checkout completo em produção após deploy (criar sessão, ver se o redirect de sucesso volta para o domínio certo).

---

### PROMPT 16 — Mitigar riscos operacionais do Baileys (versão dinâmica + alerta de desconexão)

O bot Baileys usa versão de protocolo hardcoded (`version: [2, 3000, 1035920091]` em `server/src/services/whatsapp.js` linha ~59) que vai quebrar com o tempo, e quando um número é deslogado o lojista só descobre quando clientes reclamam. Mitigue:

1. Versão dinâmica: importe `fetchLatestBaileysVersion` de `@whiskeysockets/baileys`; em `startSession`, tente `const { version } = await fetchLatestBaileysVersion()` com try/catch — em falha, use a versão pinada atual como fallback e logue warning. Cacheie o resultado em módulo por 12h para não bater na rede a cada conexão.
2. Alerta de desconexão: quando `connection === 'close'` com `DisconnectReason.loggedOut` (deslogado de verdade, não reconexão transitória), busque o email do dono da store (`store.user.email` via Prisma) e envie um email simples usando o `emailService` existente (`server/src/services/emailService.js` — adicione função `sendBotDisconnectedEmail(email, name, storeName)` seguindo o padrão visual dos templates existentes): "Seu WhatsApp foi desconectado do AGTgestor — entre no painel e escaneie o QR Code novamente". Envio não-bloqueante com `.catch` logando erro (padrão já usado em auth.js).
3. Anti-spam: não envie mais de 1 email de desconexão por store por 24h (flag em memória é suficiente).
4. Documente em comentário no topo do arquivo: riscos do protocolo não-oficial (possível banimento pela Meta) e que a alternativa oficial (Cloud API, `routes/webhook.js`) já existe.

Critérios de aceite: bot conecta usando versão dinâmica (ver log); simular loggedOut dispara 1 email e não repete; fallback funciona sem rede.

---

### PROMPT 17 — Runbook de rotação de segredos expostos

Segredos apareceram em screenshots durante o desenvolvimento (senha SMTP do Brevo, chave Stripe, JWT). Crie `deploy/ROTACAO_SEGREDOS.md` com o runbook completo, e me acompanhe na execução do que for possível:

1. **Brevo (prioritário)**: passos exatos no painel (Settings → SMTP & API → gerar nova SMTP key, revogar a antiga), comando `sed` para atualizar `SMTP_PASS` no `.env` do VPS e local, `pm2 restart`, e teste (disparar um forgot-password e confirmar recebimento).
2. **JWT_SECRET**: referência ao prompt 2 (se já executado, marcar concluído).
3. **Stripe**: passos para "roll key" no dashboard (Developers → API keys → Roll key, escolhendo expiração da antiga em 12h para janela de troca), atualização do `STRIPE_SECRET_KEY` nos dois `.env`, restart, e testes (checkout novo + `stripe listen`/evento de teste no webhook para confirmar que o `STRIPE_WEBHOOK_SECRET` não mudou — ele só muda se o endpoint for recriado).
4. **Checklist final**: confirmar que `.env` nunca esteve no git (`git log --all --oneline -- server/.env` deve ser vazio — rode e registre o resultado no documento), e regra daqui pra frente: segredos nunca em screenshot/chat; usar gerenciador de senhas.

Critérios de aceite: documento completo no repo; itens 1 e 4 executados comigo; app funcionando com os novos segredos.

---

## 🟢 BAIXOS

### PROMPT 18 — Remover log improvisado `erro_pedido.log`

Em `server/src/services/whatsapp.js` (~linha 556, função `saveOrder`) existe `require('fs').writeFileSync('erro_pedido.log', ...)` — grava no diretório de trabalho, sobrescreve a cada erro e não tem rotação. Remova a linha; o `console.error` da linha anterior já captura tudo no log do PM2. Aproveite e faça grep por outros `writeFileSync` de log improvisado no server e remova igual. Verifique se existe um `erro_pedido.log` órfão no VPS para deletar (me dê o comando).

---

### PROMPT 19 — Validação e normalização de slug da loja

Em `server/src/routes/store.js` (PUT `/`), o slug aceita qualquer string — espaços, maiúsculas, emoji, tudo quebra a URL pública `/loja/:slug`. Implemente: (1) normalize o slug recebido com a mesma lógica do registro em `auth.js` (lowercase, NFD, remover acentos, `[^a-z0-9]+` → `-`, trim de `-`); (2) valide o resultado: regex `^[a-z0-9]+(-[a-z0-9]+)*$`, comprimento 3–60, senão 400 com mensagem clara; (3) rejeite slugs reservados: `['api','admin','dashboard','login','register','uploads','loja','billing','verify-email','reset-password','forgot-password']`; (4) mantenha o check de unicidade existente, mas trate também o erro P2002 do Prisma (corrida entre o check e o update) respondendo 400 "link já em uso" em vez de 500. No frontend (StoreSettings dentro de `Dashboard.jsx`), mostre o slug normalizado em preview ("Sua loja ficará em: agentegestor.com.br/loja/…") antes de salvar, se for mudança simples; senão apenas garanta que o erro 400 do backend é exibido ao usuário.

---

### PROMPT 20 — Sanitizar parâmetros de paginação e query

Em `server/src/routes/orders.js` (GET `/`), `?page=abc` vira `NaN` no `skip` e derruba a query com 500. Corrija: `const page = Math.max(1, parseInt(req.query.page) || 1)`. Faça uma varredura (grep por `parseInt(req.query` e `parseInt(req.params`) em TODAS as rotas do server e aplique o mesmo padrão defensivo onde um `NaN` chegaria ao Prisma: IDs de params inválidos devem retornar 400/404 limpo (ex.: `const id = parseInt(req.params.id); if (isNaN(id)) return res.status(404)...`), nunca estourar 500. Liste no commit todos os pontos corrigidos. Teste: `curl` com `page=abc`, `id=abc` nos endpoints principais retorna 4xx limpo.

---

### PROMPT 21 — Deletar arquivos de upload substituídos (uploads órfãos)

Trocar logo, banner ou imagem de produto salva o arquivo novo e abandona o antigo em `server/uploads/` — o disco enche para sempre. Implemente: (1) crie util `server/src/utils/deleteUpload.js` exportando `deleteUploadFile(publicUrl)` que: só age se a string começar com `/uploads/`; extrai `path.basename` (nunca use o caminho completo — bloqueia path traversal); monta o caminho absoluto dentro da pasta uploads; `fs.unlink` com erro ignorado (arquivo pode não existir). (2) Chame-o nos pontos de substituição: upload de logo e banner em `store.js` (deletar o `logoUrl`/`bannerUrl` anterior após atualizar), upload de imagem em `products.js` (idem `imageUrl`), e também na exclusão de produto (`DELETE /:id`) para apagar a imagem junto. (3) Não delete nada quando o valor antigo for nulo ou igual ao novo. Teste: subir logo duas vezes → só o arquivo novo existe na pasta; deletar produto remove a imagem.

---

### PROMPT 22 — Otimização de imagens no upload

**Se o prompt 3 já foi executado, esta tarefa está coberta — apenas verifique e encerre.** Caso contrário, implemente só a parte de otimização dele: instalar `sharp`, reencodar todo upload de imagem (logo, banner, produto) para WebP qualidade 82 com largura máxima 1200px (GIF animado passa direto), removendo EXIF. Objetivo: loja pública leve no celular — hoje fotos de até 5MB são servidas cruas. Critério: JPEG grande vira WebP pequeno; imagens existentes continuam funcionando (só as novas são otimizadas).

---

### PROMPT 23 — Escopo de loja na consulta de serviço do availability

Em `server/src/utils/availability.js` (~linha 84), `getAvailableSlots` busca o serviço com `prisma.product.findUnique({ where: { id: serviceId } })` sem checar a loja — um usuário autenticado pode consultar duração/slots usando serviceId de outra loja. Impacto baixo (só vaza duração), mas corrija: troque por `findFirst({ where: { id: serviceId, storeId } })` — o `storeId` já é parâmetro da função. Confira se `getAvailableDates` repassa corretamente. Verifique os chamadores (rota `availability.js`, e o bot se o prompt 13 já rodou) para garantir que nada quebra quando o serviço não pertence à loja (deve retornar `[]`, comportamento já previsto pelo `if (!store || !service) return []`).

---

### PROMPT 24 — Centralizar e documentar a convenção de fuso horário

A lógica de agendamento usa a convenção "fake-UTC = horário de Brasília" com offset UTC-3 hardcoded e duplicado (`server/src/utils/availability.js` linhas ~137 e ~156: `new Date(Date.now() - 3*60*60*1000)`). Funciona, mas é frágil e não-documentado. Refatore: (1) crie `server/src/utils/time.js` exportando `BRT_UTC_OFFSET_HOURS = -3`, `nowBRT()` (Date "fake-UTC" do agora em BRT) e `todayBRT()` (string `YYYY-MM-DD`); (2) JSDoc no topo explicando a convenção: "todas as datas/horas de agendamento são armazenadas como se BRT fosse UTC (fake-UTC); o servidor DEVE rodar em UTC; comparações usam getUTC*"; (3) substitua as duplicações em `availability.js` pelos novos helpers; (4) grep por outros `- 3 * 60` ou manipulações de fuso no server e unifique; (5) adicione um check de boot em `index.js`: se `new Date().getTimezoneOffset() !== 0` (servidor fora de UTC), logue warning explícito de que os agendamentos vão desviar. Não mude nenhum comportamento — apenas centralize. Critério: mesmos slots retornados antes e depois (compare a saída de `/api/availability/slots` para uma data fixa).

---

### PROMPT 25 — Mapear explicitamente os status de assinatura da Stripe

Em `server/src/routes/stripe-webhook.js` (evento `customer.subscription.updated`), o status cru da Stripe é gravado direto no banco — valores como `trialing`, `unpaid`, `incomplete`, `paused` entram sem o app entender (o resto do código só conhece `active/past_due/canceled/free`). Implemente um mapa explícito: `active→active`, `trialing→active`, `past_due→past_due`, `canceled→canceled`, `unpaid→canceled`, `incomplete→free`, `incomplete_expired→canceled`, `paused→past_due`; status desconhecido → logue warning com o valor e NÃO atualize (mantém o último estado conhecido em vez de corromper). Quando o status mapeado não for `active`, sete também `plan: 'free'`... exceto `past_due` (período de graça: mantenha o plano, só o status muda — o middleware premium do prompt 1 decide a política; deixe comentário explicando). Adicione também o case `invoice.payment_failed` apenas com um `console.warn` informativo (a transição real de status já vem pelo `subscription.updated`). Critério: simular eventos com o Stripe CLI (`stripe trigger customer.subscription.updated`) atualiza o banco conforme o mapa.

---

### PROMPT 26 — Deploy explícito em vez de `postinstall` mágico

O `package.json` raiz tem `postinstall` que roda install de tudo + build + `prisma db push` automaticamente em qualquer `npm install` — migração implícita de schema em produção é receita de surpresa. Corrija: (1) remova o script `postinstall` do `package.json` raiz (mantenha `install:all`, `build`, `start`); (2) crie `deploy.sh` na raiz do repo com o pipeline explícito e verboso: `set -e`, `git pull origin main`, `cd server && npm install`, `npx prisma db push` (com comentário: revisar diffs de schema antes em mudanças grandes), `cd ../client && npm install && npm run build`, `pm2 restart pedido-pronto-bot`, `pm2 status`; (3) `chmod +x`; (4) atualize qualquer documentação de deploy existente no repo para apontar para o script. Me lembre de que o fluxo no VPS vira apenas: `cd /var/www/pedidoprontobot && ./deploy.sh`. Critério: rodar o script no VPS executa o deploy completo sem passos manuais.

---

### PROMPT 27 — Não resetar o pedido quando o cliente diz "oi" no meio do fluxo

Em `server/src/services/whatsapp.js` (`handleIncomingMessage`, ~linha 249), as palavras `oi/olá/ola/hi/hello/menu/inicio/voltar/cancelar` resetam a conversa ANTES de checar se há fluxo em andamento — cliente educado que responde "oi, meu nome é João" ou digita "oi" na etapa do nome perde o pedido inteiro. Corrija a precedência: (1) se NÃO há conversa ativa → comportamento atual (saudações abrem o menu); (2) se há conversa ativa em steps de navegação (`choose_category`, `choose_product`, `choose_date`, `choose_slot` se existirem) → `menu/voltar/cancelar` resetam (útil), mas `oi/olá/hi/hello` são ignorados como reset e caem no handler do step (que responderá "opção inválida"); (3) se há conversa em steps de coleta de dados (`ask_name`, `ask_time`, `ask_address`, `ask_notes`, `typing_notes`) → APENAS `cancelar` reseta; qualquer outra palavra é tratada como a resposta do cliente (um nome pode ser "Olá Maria"... aceite como veio). (4) Mencione a saída nos textos: acrescente `_(envie "cancelar" para recomeçar)_` na primeira mensagem do fluxo de pedido. Aplique a mesma lógica no fluxo paralelo de `server/src/routes/webhook.js`. Critério: digitar "oi" na etapa do nome registra "oi" como nome? Não — registra a mensagem como resposta normal do step; digitar "cancelar" em qualquer etapa volta ao menu.

---

### PROMPT 28 — Health check, monitoramento e rotação de logs

O app não tem endpoint de saúde nem alertas de queda, e os logs do PM2 crescem sem limite. Implemente: (1) em `server/src/index.js`, adicione `GET /api/health` (sem auth, ANTES do rate limiter geral se o prompt 6 já rodou): responde `{ status: 'ok', uptime: process.uptime() }` com um check real de banco (`await prisma.$queryRaw\`SELECT 1\`` em try/catch — falha → status 503 com `{ status: 'degraded', db: false }`); (2) me entregue o passo a passo do UptimeRobot (plano free): monitor HTTP(s) em `https://agentegestor.com.br/api/health`, keyword `ok`, intervalo 5min, alerta por email; (3) comandos para o VPS: `pm2 install pm2-logrotate`, `pm2 set pm2-logrotate:max_size 10M`, `pm2 set pm2-logrotate:retain 14`, `pm2 set pm2-logrotate:compress true`; (4) garanta que `/api/health` não conflita com o SPA fallback nem com CORS/helmet. Critério: `curl https://agentegestor.com.br/api/health` retorna ok; logrotate configurado (`pm2 conf`).

---

### PROMPT 29 — Tratar JSON malformado com 400 em vez de 500

O error handler global em `server/src/index.js` responde 500 para tudo — inclusive body JSON inválido (visto nos logs do PM2: `SyntaxError: Expected property name...` do body-parser), que é erro do cliente, não do servidor. Corrija o handler: antes do fallback 500, detecte erro de parse do body (`err.type === 'entity.parse.failed'` — padrão do body-parser — ou `err instanceof SyntaxError && err.status === 400 && 'body' in err`) e responda `400 { error: 'JSON inválido no corpo da requisição' }`. Aproveite e trate também `err instanceof multer.MulterError` (upload grande demais → `400` com a mensagem "Arquivo muito grande. Máximo 5MB." quando `code === 'LIMIT_FILE_SIZE'`) e o erro custom do fileFilter de upload (mensagem já em pt-BR — repasse com 400). Mantenha o 500 genérico como último recurso, sem vazar stack. Critério: `curl -X POST /api/auth/login -H 'Content-Type: application/json' -d '{invalido'` retorna 400 limpo; upload de 10MB retorna 400 com mensagem amigável.
