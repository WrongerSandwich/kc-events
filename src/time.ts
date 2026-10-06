const DAY_MS = 86_400_000;

/** Formats an instant as ISO 8601 with the given IANA timezone's offset, e.g. 2026-10-02T22:15:00-05:00. */
export function toLocalIso(instant: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMinutes = Math.round((wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/** The calendar date (YYYY-MM-DD) of an instant in the given timezone. */
export function toLocalDate(instant: Date, timeZone: string): string {
  return toLocalIso(instant, timeZone).slice(0, 10);
}

/**
 * An ISO 8601 instant for a local wall-clock date and optional time in the given timezone,
 * e.g. ("2026-10-10", "20:00", "America/Chicago") → 2026-10-10T20:00:00-05:00. Without a
 * time the result is the bare date.
 */
export function fromLocal(date: string, time: string | undefined, timeZone: string): string {
  if (!time) return date;
  const [h, m] = time.split(":").map(Number);
  // Guess the wall time is UTC, see what offset the zone has at that instant, and correct once;
  // a second pass settles the rare guess that straddles a DST change.
  let instant = Date.UTC(...splitDate(date), h!, m!, 0);
  for (let pass = 0; pass < 2; pass++) {
    const offsetMinutes = offsetAt(new Date(instant), timeZone);
    instant = Date.UTC(...splitDate(date), h!, m!, 0) - offsetMinutes * 60_000;
  }
  return toLocalIso(new Date(instant), timeZone);
}

function splitDate(date: string): [number, number, number] {
  const [y, mo, d] = date.split("-").map(Number);
  return [y!, mo! - 1, d!];
}

/** The zone's UTC offset in minutes at an instant, read off the formatted ISO string. */
function offsetAt(instant: Date, timeZone: string): number {
  const offset = toLocalIso(instant, timeZone).slice(-6);
  const sign = offset.startsWith("-") ? -1 : 1;
  return sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
}

/**
 * The last day of a run's horizon (YYYY-MM-DD): the run's local date plus the horizon's weeks.
 * An event starting after it is beyond the horizon.
 */
export function horizonEnd(today: string, horizonWeeks: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + horizonWeeks * 7 * DAY_MS).toISOString().slice(0, 10);
}
