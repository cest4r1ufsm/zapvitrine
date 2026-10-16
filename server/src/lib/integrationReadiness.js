// Configuration-only inspection. Never returns credentials or claims live approval.
function inspectIntegrations(env = process.env) {
  const present = keys => keys.filter(key => !String(env[key] || '').trim());
  const entry = (keys, verification) => {
    const missing = present(keys);
    return { status: missing.length ? 'incomplete' : 'configured_not_verified', missing, verification };
  };
  const database = entry(['DATABASE_URL'], 'Conectar com usuário de runtime e verificar migrations, PostGIS, restrições e restauração de backup.');
  if (env.DATABASE_URL && !/^postgres(?:ql)?:/.test(env.DATABASE_URL)) { database.status = 'development_only'; database.missing.push('PostgreSQL para produção'); }
  const redis = entry(['REDIS_URL'], 'Testar TLS, autenticação, limite compartilhado e indisponibilidade sem fallback.');
  if (env.REDIS_URL && !env.REDIS_URL.startsWith('rediss://')) { redis.status = 'development_only'; redis.missing.push('Redis com TLS para produção'); }
  const media = entry(['MEDIA_BUCKET', 'MEDIA_PUBLIC_URL', 'AWS_REGION'], 'Enviar e excluir imagem sintética, conferir CDN e política de expurgo/versionamento.');
  if (env.MEDIA_STORAGE !== 's3') { media.status = 'incomplete'; media.missing.push('MEDIA_STORAGE=s3'); }
  const whatsapp = entry(['META_APP_ID', 'META_APP_SECRET', 'META_SIGNUP_CONFIG_ID', 'META_WEBHOOK_VERIFY_TOKEN', 'WHATSAPP_TOKEN_ENCRYPTION_KEY'], 'Concluir acesso Meta/Tech Provider, callback e permissões; conectar número Business elegível no Android e receber mensagem.');
  if (env.WHATSAPP_TOKEN_ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(env.WHATSAPP_TOKEN_ENCRYPTION_KEY)) { whatsapp.status = 'incomplete'; whatsapp.missing.push('WHATSAPP_TOKEN_ENCRYPTION_KEY válida'); }
  const email = entry(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'], 'Verificar remetente/domínio e recebimento real de confirmação e recuperação na caixa e spam.');
  const stripe = entry(['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'STRIPE_WEBHOOK_SECRET'], 'Conferir preço/ambiente, assinatura do webhook e compra/cancelamento no modo de testes.');
  const play = entry([], 'Validar permissões da conta de serviço, produto/plano e compra/restauração em faixa de testes da Play.');
  if (!env.PLAY_SERVICE_ACCOUNT_FILE && !env.PLAY_SERVICE_ACCOUNT_JSON) { play.status = 'incomplete'; play.missing.push('PLAY_SERVICE_ACCOUNT_FILE ou PLAY_SERVICE_ACCOUNT_JSON'); }
  const map = entry(['MAPBOX_GEOCODING_TOKEN'], 'Conferir token público no build, restrição por domínio, mapa no Android e autorização de geocodificação permanente.');
  if (env.MAPBOX_PERMANENT_GEOCODING !== 'true') { map.status = 'incomplete'; map.missing.push('MAPBOX_PERMANENT_GEOCODING autorizado'); }
  return { database, redis, media, whatsapp, email, stripe, play, map };
}
module.exports = { inspectIntegrations };
