function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const missing = [];
  if (!/^postgres(?:ql)?:/.test(env.DATABASE_URL || '')) missing.push('DATABASE_URL PostgreSQL');
  if (!env.REDIS_URL?.startsWith('rediss://')) missing.push('REDIS_URL TLS');
  if (env.MEDIA_STORAGE !== 's3' || !env.MEDIA_BUCKET || !env.MEDIA_PUBLIC_URL?.startsWith('https://')) missing.push('mídia S3/CDN');
  try {
    const origin = new URL(env.APP_URL);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || env.APP_URL.replace(/\/$/, '') !== origin.origin) throw new Error('canonical');
  } catch { missing.push('APP_URL origem HTTPS canônica, sem caminho ou parâmetros'); }
  if (env.TRUST_PROXY_HOPS !== undefined && (!/^\d+$/.test(env.TRUST_PROXY_HOPS) || Number(env.TRUST_PROXY_HOPS) > 10)) missing.push('TRUST_PROXY_HOPS inteiro entre 0 e 10');
  if (env.RUN_BACKGROUND_JOBS !== 'false') missing.push('RUN_BACKGROUND_JOBS=false (worker separado)');
  if (missing.length) throw new Error(`Configuração de produção incompleta: ${missing.join(', ')}`);
}
module.exports = { validateProductionConfig };
