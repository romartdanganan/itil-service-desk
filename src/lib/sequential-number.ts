// Human-readable reference numbers (INC000001, PRB000001, CHG000001, ...)
// are cosmetic, the database's real primary key is the `id` field, but
// they still have to actually be unique. Deriving the next one from the
// highest number that already exists survives rows being deleted (a
// count-based approach doesn't: delete any row and `count() + 1` picks a
// number that's already taken, a real collision this project has hit
// more than once). Still not safe against two people submitting at the
// exact same instant, both could read the same "last" row and pick the
// same next number, a real production system would use a database
// sequence instead. Fine for a single-user-at-a-time demo; worth knowing
// the remaining limitation.
export function nextSequentialNumber(lastNumber: string | null, prefix: string): string {
  const lastValue = lastNumber ? parseInt(lastNumber.slice(prefix.length), 10) : 0;
  return `${prefix}${String(lastValue + 1).padStart(6, "0")}`;
}
