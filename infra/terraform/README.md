# Infraestrutura nacional — AgenteGestor

Código de infraestrutura preparado para revisão e implantação controlada. `terraform fmt` e `terraform validate` foram executados localmente com Terraform 1.13.5 e provedor AWS 6.68.0. Isso confirma sintaxe e contratos do provedor; não comprova quotas, custos, políticas da conta, conectividade, failover ou implantação. Nenhum `plan` autenticado ou `apply` foi executado.

## Recursos

- VPC em duas zonas de disponibilidade, sub-redes públicas para ALB/NAT e privadas para aplicação/banco. Um NAT por zona evita dependência de uma única zona para saída.
- ALB HTTPS com certificado ACM fornecido, política TLS 1.2/1.3, sem banco ou tarefas expostos à internet.
- Fargate API com duas instâncias iniciais, autoescala por CPU até oito; workers independentes com duas instâncias, leases e caixa de entrada durável no banco. Imagem deve ser informada por digest SHA-256.
- RDS PostgreSQL 17 Multi-AZ, armazenamento criptografado, SSL obrigatório, backups de 14 dias, proteção contra exclusão e snapshot final. Senha administrativa gerenciada pelo RDS/Secrets Manager, não materializada no Terraform.
- S3 privado, versionamento, criptografia e acesso público exclusivamente por CloudFront/OAC. Role da aplicação só pode operar objetos sob `public/`.
- WAF com reputação de IP e limite de requisições; webhooks não entram no limite da borda e continuam exigindo assinatura no servidor. Ajustar com tráfego real, incluindo NATs compartilhados.
- Logs por 30 dias, métricas de containers e alertas para alvos indisponíveis, erros HTTP e espaço do banco. A inscrição SNS por e-mail exige confirmação do destinatário.

## Dependências externas obrigatórias

1. Certificado ACM validado na região do ALB, DNS do domínio apontando para o ALB e imagem ECR construída/testada. A role de execução padrão permite baixar imagem do ECR; não fornece credenciais de outro registry.
2. **Redis gerenciado com TLS e autenticação**, alta disponibilidade e conexão permitida a partir da security group da aplicação. Este módulo **não cria Redis**. Preencher `REDIS_URL=rediss://...` no segredo de runtime. Se usar serviço externo à VPC, validar latência, egress e controles de acesso. Falha no Redis deve impedir operações protegidas, sem fallback silencioso para limites locais.
3. Segredo JSON já criado no Secrets Manager, fornecido por ARN. O Terraform lê apenas o ARN, nunca os valores. Cada chave listada em `runtime_secret_keys` precisa existir. Ajustar a lista conforme integrações habilitadas; chaves ausentes impedem a tarefa de iniciar.
4. `DATABASE_URL` com SSL e **usuário exclusivo da aplicação**; não usar `agt_admin`. Criar extensões PostGIS/btree_gist e executar migrations com identidade de migração separada. O usuário de runtime recebe apenas privilégios necessários, sem criar roles/extensões ou alterar esquema.
5. `APP_URL` deve ser uma única origem HTTPS canônica. O aplicativo usa cookies host-only; configurar domínio/canonicalização antes do login. Não inserir segredos em `extra_environment` ou nos argumentos de build do frontend.
6. IDs públicos/configuração da Meta em `extra_environment`, credenciais em Secrets Manager; ativação externa da Meta, Google Play e Stripe continua necessária. O token público Mapbox tem restrição por URL e entra no build como `VITE_MAPBOX_PUBLIC_TOKEN`. Token privado de geocodificação só no segredo do servidor.

O módulo não fornece MFA administrativo, políticas RLS por tenant, SIEM, verificações de pentest ou garantias de disponibilidade. O isolamento atual permanece na API e nos testes. Esses controles devem ser avaliados explicitamente antes da aprovação final, sem pressupor que existem por usar AWS.

## Sequência de implantação

1. Configurar backend remoto do Terraform com criptografia, acesso restrito e locking. Nunca versionar estado, `.tfvars` reais ou plano salvo. Usar SSO/OIDC/roles temporárias; não criar chaves AWS permanentes.
2. Executar `terraform init`, `terraform fmt -check`, `terraform validate` e um `terraform plan` na conta/região escolhida. Revisar custos de RDS Multi-AZ, NATs, ALB, Fargate, WAF, CloudFront e Redis. Os recursos aqui não equivalem a um plano gratuito.
3. Provisionar infraestrutura com contagens API/worker em zero durante bootstrap. Criar role SQL de runtime por canal administrativo controlado, aplicar migrations, importar dados em manutenção e preencher o segredo de runtime. Não deixar a API executar migrations ao iniciar.
4. Validar Redis privado/TLS, S3, rotas de saída e permissões antes de aumentar as contagens para pelo menos duas. Criar permissões de rede específicas para o Redis no provedor externo. O ARN de segredo e suas chaves são conferidos pelo ECS ao iniciar; inspecionar eventos de falha sem registrar valores.
5. Construir imagem Docker, executar testes, escanear imagem e informar digest imutável. Executar migrations em tarefa única separada, nunca simultaneamente em cada réplica. Implantar primeiro em homologação.
6. Ensaiar falha de uma tarefa, failover do banco, interrupção do Redis, falha de geocodificação, fila/retry, restauração de backup e limites de carga. Verificar isolamento entre contas e Android real. Só então autorizar tráfego público.
7. Confirmar alarmes, retenção, orçamento e responsáveis. Uma reversão de container não reverte dados automaticamente: manter compatibilidade de migrations e definir como preservar escritas após o corte.

As imagens são públicas por intenção do proprietário. Versionamento/backups retêm versões antigas: definir e testar política de expurgo de mídia e dados para solicitações de exclusão, inclusive caches, versões S3 e retenção de backups. Não prometer apagamento físico imediato apenas porque o objeto corrente foi removido.

## Desenvolvimento e integração contínua

`compose.yaml` contém apenas PostgreSQL/PostGIS e Redis **descartáveis**, vinculados ao localhost. Dados estão em tmpfs e são perdidos quando os containers param. As credenciais do arquivo são sintéticas para desenvolvimento, nunca para produção.

O workflow `quality.yml` verifica auditoria de dependências, testes SQLite em banco vazio, testes reais PostGIS, lint/build, Docker build e Terraform. Não publica imagem, não aplica Terraform e não altera produção. Docker não estava disponível no host local: a construção do container precisa passar nesse job ou em outra máquina com Docker antes de implantação.

## Implementação e evidências locais — 13/10/2026

A aplicação agora contém descoberta nacional em `/explorar`, perfil público, cadastro gratuito do estabelecimento, associação dos serviços ao catálogo existente, geolocalização voluntária, busca por município, mapa por área visível, favoritos, conta do consumidor, reserva, cancelamento e avaliação vinculada a atendimento concluído. O proprietário precisa habilitar a reserva online; ela nasce desabilitada. Perfis, avaliações e respostas passam pela moderação. A assinatura continua controlando o chatbot, sem bloquear a publicação gratuita.

A busca usa PostGIS com índice espacial e mantém os dados exatos de endereços residenciais fora das respostas públicas quando o proprietário escolhe localização aproximada. Os horários respeitam fuso IANA, exceções por data e intervalos noturnos; a disponibilidade também respeita a agenda operacional do estabelecimento. O catálogo oficial do IBGE foi consultado e sincronizado no banco descartável com 5.571 municípios. Essa sincronização precisa ser executada no banco de destino, após a importação.

Validações executadas localmente, com dados sintéticos:

- PostgreSQL 17.11/PostGIS 3.6.2 real: migrações canônicas, consultas geográficas, índices e restrições de integridade.
- Trinta conexões independentes disputando um horário: exatamente uma reserva aceita.
- Dois processos HTTP: oito repetições da mesma chave produziram uma reserva; oito reservas distintas no mesmo horário produziram duas reservas para dois profissionais e conflito nas demais.
- Banco recusou avaliações inválidas, reservas vinculadas a outra loja e avaliações vinculadas ao perfil incorreto.
- Importação SQLite para PostgreSQL: preservação de IDs e horários, snapshots de duração/preço, sequências ajustadas e recusa de destino não vazio.
- Dez mil perfis sintéticos, 40 consultas locais aquecidas: p95 de 10,56 ms na consulta SQL. Isso não representa latência nacional, desempenho sob carga real nem SLA.
- Interface: lint completo, build e testes de navegador para busca, privacidade, publicação, reservas e mapa. O contrato do mapa foi testado com provedor simulado; o token e a renderização real Mapbox continuam exigindo homologação.
- Instalações limpas dos dois projetos com auditoria de dependências sem vulnerabilidades reportadas. Auditoria de pacotes não equivale a pentest.

## Migração operacional dos dados existentes

1. Ensaiar em homologação com cópia autorizada e protegida. Congelar escritas somente durante o corte planejado; guardar backup verificado de SQLite e de uploads. O aplicativo de produção atual não foi modificado por estes testes.
2. Criar banco PostgreSQL vazio e aplicar `npm run db:migrate:postgres` usando identidade de migração. Nunca regenerar `001-baseline.sql` depois de aplicada: qualquer alteração futura requer novo arquivo numerado. O executor confere checksums e recusa alterações em migrations aplicadas.
3. Atualizar apenas a **cópia congelada** SQLite para o schema atual com o Prisma, sem tocar no banco ativo. Informar explicitamente `SOURCE_SQLITE_URL` e `DATABASE_URL` de destino, executar `npm run db:import:sqlite`. A transação recusa tabelas de destino não vazias e interrupções não deixam importação parcial. Conferir o manifesto de contagens e reconciliação de agenda. Reservas antigas sobrepostas devem ser analisadas; a restrição não será desabilitada para esconder conflitos.
4. Migrar mídia antes de publicar o novo container, que não contém uploads locais. Informar `SOURCE_UPLOADS_DIRECTORY` absoluto apontando para a cópia congelada e o banco de destino. `node scripts/migrate-media.js` faz pré-verificação sem alterar dados. Depois de configurar S3/CDN e IAM, usar `node scripts/migrate-media.js --apply --ack-frozen-copy` com `MEDIA_STORAGE=s3`. O processo reencoda imagens, preserva os originais e só atualiza referências ainda não alteradas; pode ser retomado. Falhas ambíguas podem deixar objetos sem referência para reconciliação, nunca justificar apagar o backup original.
5. Executar `node src/modules/directory/providers.js` com o banco de destino para importar municípios. Configurar Mapbox público restrito ao domínio e geocodificação permanente no servidor, com quotas. Confirmar no provedor a licença para guardar as coordenadas obtidas.
6. Validar autenticação, agenda antiga, catálogo/fotos, pesquisa, reservas, moderação, compras e integração Meta em homologação e Android real. Sessões antigas não são importadas: será necessário entrar novamente.
7. Só depois ajustar tráfego e iniciar as réplicas. A API e o worker recusam produção sem PostgreSQL, Redis TLS, S3/CDN, origem HTTPS e processamento separado. A verificação inicial também exige os controles de integridade do banco e uma identidade sem privilégios administrativos.

O campo legado `scheduledAt` preserva a representação de horário local durante esta migração; as APIs públicas entregam data, horário e fuso explicitamente. Não reinterpretar registros históricos como instantes UTC. Uma futura normalização para UTC exige backfill ensaiado e regras para registros legados ambíguos. Preços das reservas têm snapshot em centavos; o catálogo legado continua com o tipo original, sem alegar conversão integral do domínio financeiro.

Resultado da rodada integrada final: **22 suítes do servidor passaram**, incluindo os testes reais PostgreSQL/PostGIS, dois processos de reservas, dois workers independentes e inicialização. O teste de migração para um segundo banco vazio também passou separadamente. Os workers agora preservam ordem por salão e processam salões distintos em paralelo, com encerramento controlado; a API de produção apenas enfileira. Eventos com envio ambíguo exigem conferência operacional, sem repetição automática que possa duplicar mensagens ou pedidos.
