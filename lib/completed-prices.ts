import type { NumericRow } from "./buy-analysis-engine";

const US_CLOSE_CONFIRMATION_MINUTES = 16 * 60 + 15;

function newYorkClock(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, minutes: Number(part("hour")) * 60 + Number(part("minute")) };
}

function previousDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function completedUsDailyRows(rows: NumericRow[], now = new Date()) {
  const clock = newYorkClock(now);
  const cutoff = clock.minutes >= US_CLOSE_CONFIRMATION_MINUTES ? clock.date : previousDate(clock.date);
  return rows.filter((row) => String(row.date ?? "") <= cutoff);
}

export function isCompletedPriceCacheSafe(rows: NumericRow[], snapshotAt: string, now = new Date()) {
  const completed = completedUsDailyRows(rows, now);
  const latestDate = completed.map((row) => String(row.date ?? "")).filter(Boolean).sort().at(-1);
  if (!latestDate) return false;
  const snapshotClock = newYorkClock(new Date(snapshotAt));
  const currentClock = newYorkClock(now);
  if (currentClock.minutes >= US_CLOSE_CONFIRMATION_MINUTES && snapshotClock.date === currentClock.date && snapshotClock.minutes < US_CLOSE_CONFIRMATION_MINUTES) return false;
  return snapshotClock.date > latestDate || (snapshotClock.date === latestDate && snapshotClock.minutes >= US_CLOSE_CONFIRMATION_MINUTES);
}

