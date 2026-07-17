# Backup e Restore — AGTgestor

## Instalação do backup (uma vez, no VPS como root)

```bash
apt install -y sqlite3
cp /var/www/pedidoprontobot/deploy/backup-agtgestor.sh /usr/local/bin/backup-agtgestor.sh
chmod +x /usr/local/bin/backup-agtgestor.sh

# Teste manual (deve criar /var/backups/agtgestor/db-<data>.db.gz e logar "integrity: ok")
/usr/local/bin/backup-agtgestor.sh
tail -5 /var/log/agtgestor-backup.log
ls -lh /var/backups/agtgestor/

# Cron diário às 03:00
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/backup-agtgestor.sh") | crontab -
crontab -l
```

## Restore do banco

```bash
# 1. Parar o app
pm2 stop pedido-pronto-bot

# 2. Guardar o banco atual (mesmo corrompido) por segurança
mv /var/www/pedidoprontobot/server/prisma/dev.db /var/www/pedidoprontobot/server/prisma/dev.db.quebrado-$(date +%F)

# 3. Restaurar o backup escolhido e remover arquivos residuais do WAL —
#    dev.db-wal/dev.db-shm antigos misturados com o banco restaurado corrompem os dados
rm -f /var/www/pedidoprontobot/server/prisma/dev.db-wal /var/www/pedidoprontobot/server/prisma/dev.db-shm
gunzip -c /var/backups/agtgestor/db-YYYY-MM-DD-HHMM.db.gz > /var/www/pedidoprontobot/server/prisma/dev.db

# 4. Verificar integridade e religar
sqlite3 /var/www/pedidoprontobot/server/prisma/dev.db "PRAGMA integrity_check;"
pm2 restart pedido-pronto-bot
```

## Restore dos uploads

```bash
tar xzf /var/backups/agtgestor/uploads-YYYY-MM-DD-HHMM.tar.gz -C /var/www/pedidoprontobot/server/
```

## Cópia externa (fortemente recomendado)

Backup no mesmo disco não protege contra falha do disco/VPS. Configure o rclone
para um destino externo (Google Drive, Backblaze B2, S3):

```bash
apt install -y rclone
rclone config   # criar remote interativo (ex.: nome "gdrive")

# Adicionar ao cron (03:30, após o backup local):
(crontab -l 2>/dev/null; echo "30 3 * * * rclone sync /var/backups/agtgestor gdrive:agtgestor-backups --log-file /var/log/agtgestor-rclone.log") | crontab -
```

## Regras de ouro

- **Nunca** copie `dev.db` com `cp` com o app rodando — use sempre `sqlite3 .backup`.
- Teste um restore de verdade pelo menos uma vez (num arquivo temporário) para validar o procedimento.
- Antes de qualquer `prisma db push` com mudança de schema, rode o backup manual.
