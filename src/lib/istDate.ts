// This app is India-only, but the browser it renders in isn't — a viewer's device can be set
// to any system timezone. Anywhere the UI computes "today" (calendar "today" highlighting,
// "N days overdue" labels, due/pending status decisions) needs to anchor to Indian time
// regardless of that, the same way the Deno edge functions already anchor server-side
// scheduling to IST. India has no daylight savings, so IST is always exactly UTC+5:30.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * The current instant, expressed as a Date whose local getters (getFullYear, getMonth,
 * getDate, getHours, ...) read IST wall-clock fields — regardless of the host's actual
 * timezone. Everything that reads a Date via its local getters (date-fns, react-day-picker,
 * plain comparisons) will therefore see Indian time.
 */
export function getISTNow(): Date {
  const shifted = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    shifted.getUTCHours(),
    shifted.getUTCMinutes(),
    shifted.getUTCSeconds()
  );
}

/** Midnight of today's calendar date in IST, for day-level comparisons. */
export function getISTToday(): Date {
  const now = getISTNow();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
