// Small input validators for server actions. They throw Error(message); actions turn that into {ok:false,error}.
export const fail = (m) => { throw new Error(m); };
export const str = (v, name, { max = 120, optional = false } = {}) => {
  if (v == null || v === '') return optional ? null : fail(`${name} is required`);
  const s = String(v).trim();
  if (!s && !optional) fail(`${name} is required`);
  if (s.length > max) fail(`${name} is too long (max ${max})`);
  return s || null;
};
export const int = (v, name, { min = 0, max = 1000, optional = false } = {}) => {
  if (v == null || v === '') return optional ? null : fail(`${name} is required`);
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${name} must be an integer between ${min} and ${max}`);
  return n;
};
export const bool = (v, d = false) => (v == null ? d : !!v);
export const id = (v, name) => {
  const s = str(v, name, { max: 64 });
  if (!/^[A-Za-z0-9_.-]+$/.test(s)) fail(`${name} has invalid characters`);
  return s;
};

const num = (v, name, min, max, optional) => {
  if (v == null || v === '') return optional ? null : fail(`${name} is required`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(`${name} must be between ${min} and ${max}`);
  return n;
};
const clock = (v, name) => { if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v))) fail(`${name} must be HH:MM`); return String(v); };

/** Whitelist + coerce scenario/settings config. */
export function sanitizeConfig(c = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.startDate))) fail('startDate must be YYYY-MM-DD');
  let customPattern = c.customPattern ?? null;
  if (customPattern != null) {
    if (!Array.isArray(customPattern) || customPattern.length > 50 || customPattern.some((r) => !Array.isArray(r) || r.length > 96 || r.some((x) => typeof x !== 'string')))
      fail('customPattern must be an array of arrays of shift-type ids');
  }
  return {
    startDate: String(c.startDate), days: int(c.days, 'days', { min: 1, max: 62 }),
    startTime: clock(c.startTime, 'startTime'), slotDuration: num(c.slotDuration, 'slotDuration', 0.25, 24),
    peoplePerPost: int(c.peoplePerPost, 'peoplePerPost', { min: 1, max: 50 }),
    dutyHours: num(c.dutyHours, 'dutyHours', 0.25, 24), withdrawalHours: num(c.withdrawalHours, 'withdrawalHours', 0, 24),
    alternateDays: bool(c.alternateDays, true), rotationEnabled: bool(c.rotationEnabled, true),
    nightStart: clock(c.nightStart, 'nightStart'), nightEnd: clock(c.nightEnd, 'nightEnd'),
    minimumRestHours: num(c.minimumRestHours, 'minimumRestHours', 0, 240),
    maximumDutyHoursPerDay: num(c.maximumDutyHoursPerDay, 'maximumDutyHoursPerDay', 0, 24, true),
    maximumDutyHoursPerPeriod: num(c.maximumDutyHoursPerPeriod, 'maximumDutyHoursPerPeriod', 0, 2000, true),
    ...(customPattern ? { customPattern } : {}),
  };
}
