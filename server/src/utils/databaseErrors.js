function isBookingConflict(error) {
  return error?.code === '23P01' || error?.code === 'P2034'
    || error?.meta?.code === '23P01'
    || /booking_no_overlap|exclusion constraint/.test(String(error?.message || ''));
}
module.exports = { isBookingConflict };
