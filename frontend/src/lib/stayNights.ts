/**
 * عدد ليالِ الإقامة الفندقية من تاريخ الدخول (شامل) إلى الخروج (يوم المغادرة دون ليلة).
 * مثال: 1 → 4 كانون2 = 3 ليالٍ.
 */
export function stayNightsBetween(checkIn: string, checkOut: string): number | null {
  const aStr = (checkIn || "").trim();
  const bStr = (checkOut || "").trim();
  if (!aStr || !bStr) {
    return null;
  }
  const a = new Date(`${aStr}T12:00:00`);
  const b = new Date(`${bStr}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return null;
  }
  const days = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) {
    return null;
  }
  return days;
}
