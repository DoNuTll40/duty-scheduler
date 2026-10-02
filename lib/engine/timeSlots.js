// Pure time-slot helpers. Nothing here knows about 17:00 / 4h — all from config.
export const MIN_PER_DAY = 1440;

export function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

export function formatClock(min) {
  const m = ((Math.round(min) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function validateSlotConfig({ startTime, slotDuration }) {
  const errors = [];
  if (parseTime(startTime) === null)
    errors.push({ code: 'INVALID_START_TIME', severity: 'critical', message: `Invalid startTime "${startTime}" (expected HH:MM)` });
  const mins = Number(slotDuration) * 60;
  if (!(mins > 0) || Math.abs(mins - Math.round(mins)) > 1e-9)
    errors.push({ code: 'INVALID_SLOT_DURATION', severity: 'critical', message: `Invalid slotDuration "${slotDuration}"` });
  else if (MIN_PER_DAY % Math.round(mins) !== 0)
    errors.push({ code: 'SLOT_DURATION_NOT_DIVISOR_OF_DAY', severity: 'critical', message: `slotDuration ${slotDuration}h does not divide 24h evenly` });
  return errors;
}

export function generateTimeSlots({ startTime = '17:00', slotDuration = 4 } = {}) {
  const errs = validateSlotConfig({ startTime, slotDuration });
  if (errs.length) throw new RangeError(errs[0].message);
  const start = parseTime(startTime);
  const dur = Math.round(slotDuration * 60);
  return Array.from({ length: MIN_PER_DAY / dur }, (_, i) => {
    const startClock = formatClock(start + i * dur), endClock = formatClock(start + (i + 1) * dur);
    return { index: i, offsetMinutes: i * dur, durationMinutes: dur, startClock, endClock, label: `${startClock}-${endClock}` };
  });
}

/** Transport rule: a shift may only start/end on a slot boundary. */
export function checkShiftBoundary(startClock, endClock, slots) {
  const bounds = new Set(slots.map((s) => s.startClock));
  const errors = [];
  for (const [what, v] of [['start', startClock], ['end', endClock]]) {
    const p = parseTime(v);
    if (p === null || !bounds.has(formatClock(p)))
      errors.push(`Shift ${what} ${v} is not a slot boundary (${[...bounds].join(', ')})`);
  }
  return { ok: errors.length === 0, errors };
}

const ymd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
};
export const isValidDate = (s) => ymd(s) !== null;
export function dateOf(startDate, i) {
  const [y, m, d] = ymd(startDate);
  return new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
}
/** Minutes since epoch (UTC-naive) at 00:00 of day i. Multiples of 1440 => calendar-day aligned. */
export function dayBaseMinutes(startDate, i) {
  const [y, m, d] = ymd(startDate);
  return Date.UTC(y, m - 1, d + i) / 60000;
}
