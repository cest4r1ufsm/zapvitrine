# Perfil básico no VPS atual

Perfil preparado para o VPS de 2 CPU, 8 GB RAM e100 GB disco. Uma API e um worker usam exatamente a mesma imagem/release. PostgreSQL17/PostGIS e Redis8 ficam em rede privada, sem portas publicadas no host. Apenas Caddy publica80/443 e obtém HTTPS. Redis exige TLS com CA local e senha; a aplicação mantém validação do certificado via NODE_EXTRA_CA_CERTS. Mídia continua obrigatoriamente em S3/CDN; não há fallback local de produção.

**Preparado, não implantado. Docker não está disponível neste ambiente; nenhum container, certificado, segredo, domínio ou recurso externo foi criado.** YAML foi analisado localmente; comportamento real de Compose, imagens, certificados e volumes precisa do ensaio abaixo no VPS antes da migração.

## Recursos e limites

Tetos de memória: PostgreSQL2 GB, API1,25 GB, worker1,25 GB, Redis384 MB, proxy128 MB. O total de aproximadamente5 GB preserva espaço para Linux, cache e operação. Cada processo tem teto de CPU; a soma permite concorrência e continua sujeita aos2 núcleos físicos. Redis usa192 MB para dados e noeviction: quando cheio, o limitador falha fechado. Logs Docker têm rotação. Banco, Redis e certificados HTTPS usam volumes persistentes. Não usar docker compose down -v neste projeto.

O perfil é um ponto único de falha. Não representa alta disponibilidade, capacidade nacional comprovada ou número garantido de usuários. Medir latência, filas, erros, memória, disco e banco; aumentar capacidade ou separar banco/worker quando a medição justificar. Cópias de segurança devem sair deste VPS e ter restauração ensaiada. Reservar pelo menos20 GB livres e alertar antes de80% de uso.

## Preparação no Linux pelo operador

1. Instalar Docker Engine/Compose compatível com secrets, mem_limit, healthchecks e tmpfs. Confirmar que não existe outro proxy usando80/443; se existe, adaptar a entrada com planejamento, sem interromper o site atual. Não alterar DNS antes do ensaio.
2. Fazer backup da instalação atual. Manter o SQLite anterior e seus uploads intactos. Usar cópia congelada para importação, conforme o procedimento existente; não apontar o importador para banco vivo.
3. Preparar imagem com o Dockerfile da raiz e uma tag imutável. O build requer token público Mapbox quando o mapa for habilitado; os segredos de servidor não entram no build. API e worker devem sempre ter a mesma tag. Preferir digest para imagens em produção; tags PostGIS/Redis/Caddy devem ser fixadas em digests após homologação.
4. No diretório deploy: copiar .env.vps.example para .env.vps e .env.runtime.example para .env.runtime; executar explicitamente `sh prepare-vps-private.sh`. O script recusa sobrescrever private existente. Gera arquivos somente quando o operador o executa no VPS. Não rodar novamente para trocar senha de banco já criado.
5. Preencher os dois arquivos, chmod600 em ambos, e copiar as senhas hex dos arquivos correspondentes para DATABASE_URL e REDIS_URL somente em .env.runtime. .env.vps contém apenas a imagem, domínio e e-mail ACME; não é entregue à API/worker. O segredo administrativo do PostgreSQL só é montado nos serviços banco/migrate, nunca fornecido à API/worker. JWT e criptografia Meta devem ser fortes e preservados em cofre. Não inserir valores reais em Git, chat ou logs. O diretório private fica0700; apenas certificados/chave Redis montados individualmente são legíveis dentro do container. Guardar a chave da CA fora do servidor após emissão e monitorar expiração do certificado Redis.
6. Configurar IAM restrito ao bucket/prefixo de mídia, CDN HTTPS, região e credenciais da conta que já hospeda a mídia. Validar uploads antes de apontar tráfego. Não substituir S3 por disco do VPS.
7. Definir APP_DOMAIN/ACME_EMAIL em .env.vps e APP_URL HTTPS canônica em .env.runtime (mesmo domínio). APP_IMAGE deve ser tag/digest real já construída. Meta, Play, Stripe e geocodificação só habilitam quando credenciais e requisitos externos estiverem homologados. Ausência de credencial não significa que integração foi ativada.

Comandos a partir de deploy, após revisão dos valores:

```sh
docker compose --env-file .env.vps -f compose.vps.yaml config --quiet
docker compose --env-file .env.vps -f compose.vps.yaml up -d postgres redis
docker compose --env-file .env.vps -f compose.vps.yaml --profile tools run --rm migrate
docker compose --env-file .env.vps -f compose.vps.yaml exec -T postgres psql -U agt_admin -d agtgestor -v ON_ERROR_STOP=1 -f /bootstrap/grant-app.sql
docker compose --env-file .env.vps -f compose.vps.yaml up -d api worker proxy
```

Na instalação atual da Hostinger, o Nginx do host continua responsável pelo HTTPS e encaminha para `127.0.0.1:3001`. Portanto, qualquer criação ou recriação de API/worker em produção deve incluir também a sobreposição `compose.nginx.yaml`:

```sh
docker compose --env-file deploy/.env.vps \
  -f deploy/compose.vps.yaml \
  -f deploy/compose.nginx.yaml \
  up -d --no-deps api worker
```

Não executar `up`, `restart` ou `force-recreate` de API/worker apenas com `compose.vps.yaml` nesse host: o serviço fica saudável dentro do Docker, mas perde a publicação `127.0.0.1:3001` e o Nginx externo responde 502. Após toda recriação, conferir `docker compose ps` e exigir `https://agentegestor.com.br/api/health` com HTTP 200.

O script de inicialização cria agt_app sem superuser, createdb ou createrole. Ele só executa em volume PostgreSQL vazio. Migrations são explícitas, usando o papel administrativo; depois, grant-app.sql concede CRUD/seq ao papel da aplicação e retira acesso ao registro de migrations. Repetir grants após novas migrations. API/worker verificam extensões, triggers e privilégio do usuário ao iniciar. Não contornar productionConfig nem os checks para iniciar com banco incompleto.

Verificar logs sem imprimir env, health da API, HTTPS, login/CSRF, diretório, upload, agendamento, worker e callbacks. A conta de aplicação deve conectar como agt_app. Não publicar porta5432 ou6379. Firewall do VPS deve expor apenas80/443 e acesso administrativo restrito. Não montar socket Docker na aplicação.

## Backup PostgreSQL e restauração ensaiada

O procedimento antigo RESTORE.md é histórico SQLite. Para este perfil, pg_dump custom inclui dados, extensões/estrutura e objetos da aplicação. Não inclui mídias S3, arquivos de segredo, configuração DNS, papéis ou todos os arquivos HTTPS: protegê-los separadamente. Habilitar versionamento/lifecycle no bucket e manter cópias criptografadas fora do VPS.

Backup manual, depois de verificar espaço livre:

```sh
umask 077
mkdir -p backups
docker compose --env-file .env.vps -f compose.vps.yaml exec -T postgres pg_dump -U agt_admin -d agtgestor --format=custom > backups/agtgestor-AAAAMMDD-HHMM.dump
```

Usar nome real único, checar exit code, tamanho e transferir para armazenamento externo seguro. Automatizar agendamento somente na operação aprovada, nunca considerar existência do arquivo como prova de restauração.

Ensaio em **outro banco**, com nome único aprovado pelo operador, mantendo agtgestor intacto:

```sh
docker compose --env-file .env.vps -f compose.vps.yaml exec -T postgres createdb -U agt_admin agt_restore_ensaio_20261015
docker compose --env-file .env.vps -f compose.vps.yaml exec -T postgres pg_restore -U agt_admin -d agt_restore_ensaio_20261015 --exit-on-error < backups/agtgestor-AAAAMMDD-HHMM.dump
```

Confirmar extensões, contagens de usuários/lojas/pedidos, amostras anonimizadas, integridade de reservas/reviews e imagens S3. Validar app isolado apontando para esse banco, sem enviar e-mails, webhooks ou cobranças. Não usar --clean no banco ativo, não restaurar sobre agtgestor nem apagar o banco de ensaio automaticamente. O operador decide descarte depois de guardar a evidência.

Recuperação de incidente exige plano: congelar gravações, escolher backup, ensaiar recuperação, decidir corte com operador e documentar perda possível entre backup e incidente. Não existe restauração destrutiva automática neste perfil.

## Evolução sem reescrever o produto

Primeiro separar PostgreSQL para serviço dedicado, depois adicionar API/worker conforme métricas. Preservar imagem imutável, S3/CDN, sessões revogáveis, Redis TLS compartilhado e locks PostgreSQL. Isso permite expansão sem acoplar dados a um container. Manter a migração de mídia/SQLite separada e revisável. Os scripts existentes de deploy antigo não devem ser executados cegamente sobre esta instalação.
