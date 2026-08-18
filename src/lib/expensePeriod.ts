import { addYears, addMonths, addDays, isSameDay, differenceInCalendarDays, format } from "date-fns";

export type TenureUnit = "days" | "months" | "years";

export const tenureUnitLabel: Record<TenureUnit, string> = {
  days: "Day(s)",
  months: "Month(s)",
  years: "Year(s)",
};

/** From-date + tenure -> to-date, inclusive on both ends (e.g. 1 year from 1 Apr 2020
 *  lands on 31 Mar 2021, matching how insurance/tax periods are normally quoted). */
export function computeToDate(from: Date, value: number, unit: TenureUnit): Date {
  if (unit === "years") return addDays(addYears(from, value), -1);
  if (unit === "months") return addDays(addMonths(from, value), -1);
  return addDays(from, value - 1);
}

const MAX_YEARS = 50;
const MAX_MONTHS = MAX_YEARS * 12;

/** From-date + to-date -> the tenure that would reproduce that to-date, preferring the
 *  coarsest whole unit (years, then months) that fits exactly and falling back to a plain
 *  day count otherwise. */
export function decomposeTenure(from: Date, to: Date): { value: number; unit: TenureUnit } {
  if (to < from) return { value: 0, unit: "days" };

  for (let y = 1; y <= MAX_YEARS; y++) {
    if (isSameDay(computeToDate(from, y, "years"), to)) return { value: y, unit: "years" };
  }
  for (let m = 1; m <= MAX_MONTHS; m++) {
    if (isSameDay(computeToDate(from, m, "months"), to)) return { value: m, unit: "months" };
  }
  return { value: differenceInCalendarDays(to, from) + 1, unit: "days" };
}

/** "1 Apr 2020 – 31 Mar 2021 (1 Year)" — for read-only display of a stored period. */
export function formatExpensePeriod(periodFrom: string, periodTo: string): string {
  const from = new Date(periodFrom);
  const to = new Date(periodTo);
  const { value, unit } = decomposeTenure(from, to);
  const unitLabel = value === 1 ? tenureUnitLabel[unit].replace("(s)", "") : tenureUnitLabel[unit].replace("(s)", "s");
  return `${format(from, "dd MMM yyyy")} – ${format(to, "dd MMM yyyy")} (${value} ${unitLabel})`;
}
