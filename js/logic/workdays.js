// Workday (business day) arithmetic. Dates are always "YYYY-MM-DD" strings,
// handled in UTC internally to avoid DST-related off-by-one bugs.
// Only Saturday/Sunday are skipped for now; `holidays` (a Set of "YYYY-MM-DD"
// strings) is threaded through everywhere so a German public-holiday list
// could be added later without changing any call site.

export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayStr() {
  const now = new Date();
  return formatDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function isWorkday(dateStr, holidays = new Set()) {
  const dow = parseDate(dateStr).getUTCDay(); // 0=Sun .. 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !holidays.has(dateStr);
}

export function addWorkdays(startStr, n, holidays = new Set()) {
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let current = parseDate(startStr);
  while (remaining > 0) {
    current = new Date(current.getTime() + step * 86400000);
    if (isWorkday(formatDate(current), holidays)) remaining -= 1;
  }
  return formatDate(current);
}

export function nextWorkday(dateStr, holidays = new Set()) {
  return addWorkdays(dateStr, 1, holidays);
}

/** Number of workdays in the half-open interval (start, end]. Negative if end < start. */
export function countWorkdaysBetween(startStr, endStr, holidays = new Set()) {
  if (endStr < startStr) return -countWorkdaysBetween(endStr, startStr, holidays);
  let current = parseDate(startStr);
  const end = parseDate(endStr);
  let count = 0;
  while (current.getTime() < end.getTime()) {
    current = new Date(current.getTime() + 86400000);
    if (isWorkday(formatDate(current), holidays)) count += 1;
  }
  return count;
}

export function isFirstWorkdayOfMonth(dateStr) {
  if (!isWorkday(dateStr)) return false;
  const d = parseDate(dateStr);
  let current = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  while (!isWorkday(formatDate(current))) {
    current = new Date(current.getTime() + 86400000);
  }
  return formatDate(current) === dateStr;
}
