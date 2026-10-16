async function verifyDatabase(prisma, env = process.env) {
  await prisma.$queryRaw`SELECT 1`;
  if (env.NODE_ENV !== 'production') return;
  const [state] = await prisma.$queryRaw`
    SELECT
      EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS spatial,
      EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'booking_no_overlap' AND contype = 'x') AS bookings,
      EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'public_booking_integrity' AND tgenabled <> 'D') AS consumers,
      EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'review_verified_booking' AND tgenabled <> 'D') AS reviews,
      (SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = current_user) AS elevated
  `;
  if (!state?.spatial || !state.bookings || !state.consumers || !state.reviews) throw new Error('Migrations obrigatórias do banco ainda não foram aplicadas');
  if (state.elevated) throw new Error('A aplicação exige uma identidade de banco sem privilégios administrativos');
}
module.exports = { verifyDatabase };
