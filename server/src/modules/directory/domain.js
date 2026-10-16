'use strict';

const SERVICES = Object.freeze([['corte-feminino', 'Corte feminino'], ['corte-masculino', 'Corte masculino'], ['penteado', 'Penteado'], ['maquiagem', 'Maquiagem'], ['coloracao', 'Coloração'], ['mechas', 'Mechas'], ['escova', 'Escova'], ['cabelos-cacheados', 'Cabelos cacheados'], ['tratamento-capilar', 'Tratamento capilar'], ['barba', 'Barba'], ['manicure', 'Manicure'], ['pedicure', 'Pedicure'], ['sobrancelhas', 'Sobrancelhas'], ['trancas', 'Tranças'], ['alongamento', 'Alongamento capilar'], ['depilacao', 'Depilação']].map(([slug, name]) => ({
  slug,
  name
})));
const UF_ZONES = {
  AC: 'America/Rio_Branco',
  AL: 'America/Maceio',
  AP: 'America/Belem',
  AM: 'America/Manaus',
  BA: 'America/Bahia',
  CE: 'America/Fortaleza',
  DF: 'America/Sao_Paulo',
  ES: 'America/Sao_Paulo',
  GO: 'America/Sao_Paulo',
  MA: 'America/Fortaleza',
  MT: 'America/Cuiaba',
  MS: 'America/Campo_Grande',
  MG: 'America/Sao_Paulo',
  PA: 'America/Belem',
  PB: 'America/Fortaleza',
  PR: 'America/Sao_Paulo',
  PE: 'America/Recife',
  PI: 'America/Fortaleza',
  RJ: 'America/Sao_Paulo',
  RN: 'America/Fortaleza',
  RS: 'America/Sao_Paulo',
  RO: 'America/Porto_Velho',
  RR: 'America/Boa_Vista',
  SC: 'America/Sao_Paulo',
  SP: 'America/Sao_Paulo',
  SE: 'America/Maceio',
  TO: 'America/Araguaina'
};
function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function num(value, min, max, name) {
  if (value === '' || value === undefined || value === null || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) fail(`${name} inválido`);
  return Number(value);
}
function text(value, min, max, name) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail(`${name} inválido`);
  return value.trim();
}
function version(value) {
  if (!Number.isInteger(value) || value < 0) fail('Informe a versão atual do perfil');
  return value;
}
function intervals(value) {
  if (!Array.isArray(value) || value.length > 4) fail('Horários inválidos');
  const result = value.map(i => {
    if (!i || !/^([01]\d|2[0-3]):[0-5]\d$/.test(i.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(i.end) || i.start === i.end) fail('Intervalos de horário inválidos');
    return {
      start: i.start,
      end: i.end
    };
  }).sort((a, b) => a.start.localeCompare(b.start));
  const min = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const ranges = result.map(i => [min(i.start), min(i.end) + (i.end < i.start ? 1440 : 0)]);
  for (let j = 1; j < ranges.length; j++) if (ranges[j][0] < ranges[j - 1][1]) fail('Horários sobrepostos');
  return result;
}
function hours(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') fail('Horários inválidos');
  const output = {};
  for (const [day, list] of Object.entries(value)) {
    if (!/^[0-6]$/.test(day)) fail('Dia inválido');
    output[day] = intervals(list);
  }
  for (let day = 0; day < 7; day++) {
    const overnight = (output[(day + 6) % 7] || []).find(i => i.end < i.start);
    if (overnight && (output[day] || []).some(i => i.start < overnight.end)) fail('Horários sobrepostos entre dias');
  }
  return output;
}
function holidayHours(value = {}) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length > 100) fail('Exceções de horário inválidas');
  const result = {};
  for (const [date, list] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) fail('Data de exceção inválida');
    result[date] = intervals(list);
  }
  return result;
}
function publicLocation(lat, lng, precision) {
  return precision === 'approximate' ? {
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100
  } : {
    lat,
    lng
  };
}
function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = v => v * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
const publicStoreSelect = {
  slug: true,
  logoUrl: true,
  bannerUrl: true,
  products: {
    where: {
      active: true
    },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      duration: true,
      imageUrl: true,
      directoryServices: {
        select: {
          slug: true
        }
      }
    },
    orderBy: {
      price: 'asc'
    },
    take: 30
  }
};
function isOpen(row, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: row.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now).map(p => [p.type, p.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
    clock = parts.hour + ':' + parts.minute,
    date = parts.year + '-' + parts.month + '-' + parts.day;
  return isOpenLocal(row, date, clock);
}
function isOpenLocal(row, date, clock) {
  const day = new Date(date + 'T12:00:00Z').getUTCDay();
  const weekly = JSON.parse(row.hoursJson),
    exceptions = JSON.parse(row.holidayHoursJson || '{}'),
    today = exceptions[date] ?? weekly[day] ?? [];
  if (today.some(i => i.end > i.start ? clock >= i.start && clock < i.end : clock >= i.start)) return true;
  // An explicit exception replaces the whole date, including yesterday's carry.
  if (Object.hasOwn(exceptions, date)) return false;
  const previous = new Date(date + 'T12:00:00Z');
  previous.setUTCDate(previous.getUTCDate() - 1);
  return (exceptions[previous.toISOString().slice(0, 10)] ?? weekly[(day + 6) % 7] ?? []).some(i => i.end < i.start && clock < i.end);
}
function project(row, distance) {
  return {
    publicId: row.publicId,
    onlineBookingEnabled: row.onlineBookingEnabled === true,
    name: row.name,
    logoUrl: row.store?.logoUrl || null,
    bannerUrl: row.store?.bannerUrl || null,
    products: row.store?.products || [],
    priceFrom: row.store?.products?.[0]?.price ?? null,
    description: row.description,
    phone: row.phone,
    storeSlug: row.store?.slug || row.storeSlug,
    city: row.city,
    uf: row.uf,
    municipalityCode: row.municipalityCode,
    neighborhood: row.neighborhood,
    address: row.locationPrecision === 'exact' ? row.address : null,
    location: {
      lat: row.publicLatitude,
      lng: row.publicLongitude,
      precision: row.locationPrecision
    },
    services: (row.services || []).map(s => s.slug),
    hours: JSON.parse(row.hoursJson),
    holidayHours: JSON.parse(row.holidayHoursJson || '{}'),
    timeZone: row.timeZone,
    openNow: isOpen(row),
    ...(distance === undefined ? {} : {
      distanceKm: Math.round(distance * 10) / 10
    })
  };
}
function owner(row) {
  if (!row) return null;
  return {
    ...project(row),
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    locationPrecision: row.locationPrecision,
    status: row.status,
    version: row.version,
    consent: !!row.consentAt,
    coordinatesConfirmed: !!row.coordinatesConfirmedAt,
    productServices: (row.store?.products || []).map(p => ({
      productId: p.id,
      services: (p.directoryServices || []).map(t => t.slug)
    })),
    moderationReason: row.moderationReason
  };
}
module.exports = {
  isOpenLocal,
  holidayHours,
  isOpen,
  publicStoreSelect,
  SERVICES,
  UF_ZONES,
  normalize,
  fail,
  num,
  text,
  version,
  hours,
  publicLocation,
  distanceKm,
  project,
  owner
};
