'use strict';

const {
  UF_ZONES,
  normalize,
  fail
} = require('./domain');
// IBGE publishes municipality identity. Municipalities spanning a state's timezone
// exceptions retain explicit owner-confirmed IANA timezone on the listing.
async function syncMunicipalities(db, fetcher = fetch) {
  const response = await fetcher('https://servicodados.ibge.gov.br/api/v1/localidades/municipios', {
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) fail('IBGE indisponível', 503);
  const data = await response.json();
  if (!Array.isArray(data) || data.length < 5000 || data.length > 6500) fail('Catálogo IBGE incompleto', 503);
  const rows = data.map(m => {
    const uf = m.microrregiao?.mesorregiao?.UF?.sigla || m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla;
    if (!UF_ZONES[uf] || !/^\d{7}$/.test(String(m.id)) || typeof m.nome !== 'string') fail('Resposta IBGE inválida', 503);
    return {
      code: String(m.id),
      name: m.nome,
      searchName: normalize(m.nome),
      uf,
      timeZone: UF_ZONES[uf]
    };
  });
  // Batches avoid one long lock. Existing catalog remains usable on network failure;
  // updates are idempotent and municipalities are never deleted automatically.
  for (let i = 0; i < rows.length; i += 100) await db.$transaction(rows.slice(i, i + 100).map(row => db.directoryMunicipality.upsert({
    where: {
      code: row.code
    },
    create: row,
    update: row
  })));
  return {
    count: rows.length
  };
}
async function quota(db, key, limit, windowMs) {
  const bucket = Math.floor(Date.now() / windowMs),
    id = `${key}:${bucket}`;
  const row = await db.directoryQuota.upsert({
    where: {
      key: id
    },
    create: {
      key: id,
      count: 1,
      expiresAt: new Date((bucket + 1) * windowMs)
    },
    update: {
      count: {
        increment: 1
      }
    }
  });
  if (row.count > limit) fail('Limite temporário atingido. Tente novamente mais tarde.', 429);
}
async function geocode(db, userId, address, municipality, fetcher = fetch) {
  if (!process.env.MAPBOX_GEOCODING_TOKEN || process.env.MAPBOX_PERMANENT_GEOCODING !== 'true') fail('Localização por endereço ainda não configurada', 503);
  await quota(db, `geocode:user:${userId}`, 20, 86400000);
  await quota(db, 'geocode:global', Number(process.env.DIRECTORY_GEOCODE_DAILY_LIMIT) || 1000, 86400000);
  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  for (const [k, v] of Object.entries({
    q: `${address}, ${municipality.name}, ${municipality.uf}, Brasil`,
    country: 'br',
    language: 'pt',
    types: 'address',
    limit: '1',
    permanent: 'true',
    access_token: process.env.MAPBOX_GEOCODING_TOKEN
  })) url.searchParams.set(k, v);
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) fail('Não foi possível localizar o endereço agora', 503);
    const data = await response.json();
    const feature = data.features?.[0],
      coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) fail('Endereço não localizado. Revise os dados.', 422);
    return {
      latitude: coords[1],
      longitude: coords[0],
      label: feature.properties?.full_address || address,
      provider: 'mapbox',
      confidence: feature.properties?.match_code?.confidence || 'unknown',
      requiresConfirmation: true
    };
  } catch (e) {
    if (e.status) throw e;
    fail('Não foi possível localizar o endereço agora', 503);
  }
}
module.exports = {
  syncMunicipalities,
  quota,
  geocode
};
if (require.main === module) {
  const db = require('../../lib/prisma');
  syncMunicipalities(db).then(r => console.log(`Municípios sincronizados: ${r.count}`)).catch(() => {
    console.error('Falha ao sincronizar municípios. Catálogo anterior preservado.');
    process.exitCode = 1;
  }).finally(() => db.$disconnect());
}
