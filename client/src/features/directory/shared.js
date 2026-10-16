import { request } from '../../services/api';

export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
export const directoryRequest = (path, options) => request(`/v1${path}`, options);
export const mutate = (path, body, method = 'POST') => directoryRequest(path, { method, body: JSON.stringify(body) });
export const statusLabels = { draft: 'Rascunho', pending: 'Em análise', published: 'Publicado', rejected: 'Ajustes necessários', suspended: 'Suspenso', unpublished: 'Fora do ar' };
export function contactUrl(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const normalized = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^55\d{10,11}$/.test(normalized) ? `https://wa.me/${normalized}` : null;
}
export function routeUrl(listing) {
  if (listing.location?.precision !== 'exact') return null;
  const { lat, lng } = listing.location;
  return Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : null;
}
export function queryString(values) {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value != null)).toString();
}
