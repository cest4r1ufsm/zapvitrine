const DEFAULT_ZONE = 'America/Sao_Paulo';
function localClock(timeZone = DEFAULT_ZONE, instant = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
async function storeTimeZone(prisma, storeId) {
  const listing = prisma.directoryListing && await prisma.directoryListing.findUnique({ where: { storeId }, select: { timeZone: true } });
  return listing?.timeZone || DEFAULT_ZONE;
}
module.exports = { localClock, storeTimeZone, DEFAULT_ZONE };
