# AGTGestor — instruções para configurar um colaborador

Este documento pode ser entregue integralmente ao agente de programação do colaborador. Ele contém o contexto e as regras necessárias para preparar o computador, executar o projeto localmente e enviar alterações ao GitHub sem acessar ou afetar a produção.

## Prompt para o agente do colaborador

> Você está configurando um ambiente de desenvolvimento do AGTGestor. Execute as etapas deste documento de forma autônoma, inspecione os resultados de cada comando e corrija apenas problemas locais. Não solicite nem use credenciais de produção. Não faça deploy. Não faça push em `main` ou `feat/base-nacional`. Antes de editar, crie uma branch própria atualizada a partir de `origin/feat/base-nacional`. Preserve todo comportamento existente e só altere arquivos relacionados à tarefa recebida. Ao terminar, execute os portões de qualidade, revise o diff, crie commits pequenos e envie somente sua branch. Entregue o link do Pull Request e um resumo dos testes.

## 1. Visão técnica

- Repositório: `https://github.com/cest4r1ufsm/zapvitrine.git`
- Branch de integração atual: `feat/base-nacional`
- Frontend: React 19, Vite 8 e React Router.
- Backend: Node.js, Express, Prisma e testes nativos do Node.
- Desenvolvimento local padrão: SQLite descartável.
- Infraestrutura integrada: PostgreSQL/PostGIS 17 e Redis 8 via Docker Compose.
- Produção: containers em VPS. Produção não deve ser acessada pelo colaborador.
- Web: cobrança via Stripe.
- Android TWA: cobrança via Google Play Billing.
- Node.js oficial do CI: versão 24.

## 2. Pré-requisitos

Instale antes de prosseguir:

- Git;
- Node.js 24 LTS ou versão 24 atual;
- Docker Desktop com Docker Compose, apenas para testes PostgreSQL/Redis;
- GitHub CLI (`gh`), recomendado para abrir Pull Requests;
- Android Studio e JDK somente se a tarefa envolver `android-twa/`.

Confirme:

```bash
git --version
node --version
npm --version
docker --version
docker compose version
gh --version
```

O `node --version` precisa começar com `v24`.

## 3. Acesso ao GitHub

O proprietário do projeto deve adicionar o colaborador em:

`GitHub > repositório zapvitrine > Settings > Collaborators > Add people`

O colaborador aceita o convite e autentica o GitHub CLI:

```bash
gh auth login
gh auth status
```

Use conta pessoal, protocolo HTTPS e autenticação pelo navegador. Nunca compartilhe token pessoal pelo chat, por arquivo ou em commit.

## 4. Clonagem e branch de trabalho

```bash
git clone https://github.com/cest4r1ufsm/zapvitrine.git
cd zapvitrine
git fetch --all --prune
git switch feat/base-nacional
git pull --ff-only origin feat/base-nacional
git switch -c feat/SEU-NOME-descricao-curta
```

Substitua `SEU-NOME-descricao-curta`, por exemplo: `feat/joao-ajuste-agenda`.

Antes de qualquer edição, confirme:

```bash
git status --short --branch
git remote -v
```

O diretório deve estar limpo e a branch atual não pode ser `main` nem `feat/base-nacional`.

## 5. Instalação reproduzível

Não use `npm install` para a primeira configuração. Use os lockfiles existentes:

```bash
cd server
npm ci
cd ../client
npm ci
cd ..
```

Não atualize dependências, lockfiles ou versões como efeito colateral de outra tarefa.

## 6. Ambiente local seguro

Crie `server/.env` somente no computador local. O arquivo já é ignorado pelo Git.

```dotenv
NODE_ENV=development
PORT=3001
APP_URL=http://localhost:5007
DATABASE_URL=file:./dev.db
JWT_SECRET=local-development-secret-change-me-32-characters
MEDIA_STORAGE=local
RUN_BACKGROUND_JOBS=false
ALLOW_LEGACY_TEST_AUTH=false
```

Opcionalmente, crie `client/.env.local`:

```dotenv
VITE_API_URL=http://localhost:3001/api
```

Não copie `.env` de produção. Não configure localmente Stripe, Meta, WhatsApp, SMTP, R2/S3, Mapbox privado ou chaves de assinatura Android sem uma tarefa específica e autorização do proprietário.

Prepare o banco SQLite local:

```bash
cd server
npx prisma generate
npx prisma db push
cd ..
```

O arquivo `server/prisma/dev.db` é local e não deve entrar em commit.

## 7. Executar o sistema

Abra dois terminais.

Terminal 1:

```bash
cd server
npm run dev
```

Terminal 2:

```bash
cd client
npm run dev
```

Endereços:

- Interface: `http://localhost:5007`
- API: `http://localhost:3001`

O colaborador deve criar uma conta local pela própria interface. Contas e senhas de produção nunca devem ser usadas no ambiente local.

## 8. Portões obrigatórios antes de cada push

Execute da raiz do repositório:

```bash
cd server
npm test
cd ../client
npm run lint
npm test
npm run build
cd ..
```

Se Docker estiver disponível, valide também a infraestrutura integrada:

```bash
docker compose up -d --wait
```

No PowerShell:

```powershell
$env:DATABASE_URL='postgresql://agt_test:local-development-only@localhost:55432/agt_disposable'
$env:TEST_POSTGRES_URL=$env:DATABASE_URL
$env:TEST_POSTGRES_DISPOSABLE='yes'
Set-Location server
npm run db:prepare:postgres
npm run db:migrate:postgres
npm run test:postgres
Set-Location ..
docker compose down
```

No Bash:

```bash
export DATABASE_URL='postgresql://agt_test:local-development-only@localhost:55432/agt_disposable'
export TEST_POSTGRES_URL="$DATABASE_URL"
export TEST_POSTGRES_DISPOSABLE=yes
cd server
npm run db:prepare:postgres
npm run db:migrate:postgres
npm run test:postgres
cd ..
docker compose down
```

O Compose local usa armazenamento temporário e dados descartáveis. Nunca troque essa URL por uma URL externa.

## 9. Regras de alteração

1. Leia os arquivos relacionados e os testes existentes antes de editar.
2. Preserve APIs, rotas, dados e comportamento fora do escopo da tarefa.
3. Não reformate arquivos inteiros sem necessidade.
4. Não altere `deploy/`, `infra/`, cobrança, autenticação, banco ou `android-twa/` sem tarefa explícita.
5. Migração de banco deve ser aditiva e compatível com dados existentes. Nunca apague coluna ou tabela automaticamente.
6. Não desative testes, lint, validações de segurança ou controles de acesso.
7. Não inclua segredos, bancos, backups, logs, builds ou mídia em commits.
8. Não use `git reset --hard`, force push ou rebase em branch compartilhada.
9. Não faça deploy. O proprietário integra e publica após revisar o Pull Request.
10. Uma tarefa por branch e, de preferência, commits pequenos no padrão Conventional Commits.

Exemplos:

```text
feat(agenda): permitir duração personalizada
fix(mobile): impedir overflow na tabela de clientes
test(auth): cobrir expiração de sessão
docs(collab): esclarecer configuração local
```

## 10. Sincronização sem sobrescrever trabalho

Antes de iniciar o dia e antes de abrir o Pull Request:

```bash
git status --short
git fetch origin
git rebase origin/feat/base-nacional
```

Só faça o rebase com a árvore de trabalho limpa. Se houver conflito, não escolha automaticamente “ours” ou “theirs”. Entenda as duas alterações, preserve ambas quando necessário e execute novamente todos os testes.

Se a branch já estiver em revisão e o rebase exigir reescrever o histórico, pare e combine com o proprietário. Não use `--force`; se houver autorização explícita, use no máximo `--force-with-lease` na própria branch.

## 11. Revisão e envio

```bash
git status --short
git diff --check
git diff
git add ARQUIVOS-DA-TAREFA
git diff --cached
git commit -m "tipo(escopo): resumo objetivo"
git push -u origin HEAD
```

Nunca use `git add .` sem revisar os arquivos incluídos.

Abra o Pull Request para `feat/base-nacional`:

```bash
gh pr create --base feat/base-nacional --fill
```

O Pull Request precisa informar:

- problema resolvido;
- arquivos e comportamento alterados;
- testes executados e resultados;
- capturas para mudanças visuais em desktop e mobile;
- riscos, migrações ou integrações afetadas;
- o que não foi testado.

Aguarde os jobs `tests`, `infrastructure`, `postgres` e `container` ficarem verdes. Não mescle o próprio Pull Request sem aprovação do proprietário.

## 12. Segredos e incidentes

Arquivos proibidos em commit incluem `.env`, `*.db`, `*.db-journal`, backups, credenciais JSON, keystores, chaves SSH e tokens.

Antes do push, confira:

```bash
git status --short
git diff --cached --name-only
git grep -n -I -E "(BEGIN (RSA|OPENSSH|PRIVATE) KEY|sk_live_|whsec_|AWS_SECRET_ACCESS_KEY=)" -- . ':!docs/GUIDA_COLABORACAO_AGENTE.md'
```

Se algum segredo entrar em commit, não faça push. Remova-o do histórico local e avise o proprietário. Se já tiver sido enviado, pare imediatamente e peça a revogação/rotação da credencial. Apenas apagar o arquivo em outro commit não elimina o vazamento.

## 13. Critério de conclusão para o agente

Uma tarefa só está pronta quando:

- a mudança funciona localmente;
- os testes relacionados foram adicionados ou atualizados;
- backend, lint, testes e build do frontend passam;
- o diff contém apenas arquivos da tarefa;
- nenhum segredo ou artefato foi incluído;
- a branch foi enviada sem force push;
- o Pull Request aponta para `feat/base-nacional`;
- o CI está verde ou qualquer falha está documentada sem ser ocultada.

Ao finalizar, o agente deve responder ao colaborador com: nome da branch, hash dos commits, link do Pull Request, lista de testes e eventuais pontos que o proprietário precisa revisar.
