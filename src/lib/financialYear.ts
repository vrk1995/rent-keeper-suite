/**
 * Financial Year utilities.
 * FY 25-26 = April 1 2025 → March 31 2026 (both inclusive).
 */

export interface FinancialYear {
  label: string; // e.g. "FY 25-26"
  value: string; // e.g. "2025-2026"
  startDate: string; // "2025-04-01"
  endDate: string; // "2026-03-31"
}

/** Build a FY object from the starting calendar year. */
export const buildFY = (startYear: number): FinancialYear => {
  const endYear = startYear + 1;
  const shortStart = String(startYear).slice(-2);
  const shortEnd = String(endYear).slice(-2);
  return {
    label: `FY ${shortStart}-${shortEnd}`,
    value: `${startYear}-${endYear}`,
    startDate: `${startYear}-04-01`,
    endDate: `${endYear}-03-31`,
  };
};

/** Return the FY that contains a given date. */
export const getFYForDate = (date: Date): FinancialYear => {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  // April (3) onwards → FY starts this year; Jan-Mar → FY started last year
  const startYear = month >= 3 ? year : year - 1;
  return buildFY(startYear);
};

/** Get the current FY. */
export const getCurrentFY = (): FinancialYear => getFYForDate(new Date());

/** Generate a list of FYs for selection (current + a few past). */
export const getFinancialYearOptions = (count = 5): FinancialYear[] => {
  const current = getCurrentFY();
  const startYear = parseInt(current.value.split("-")[0]);
  const options: FinancialYear[] = [];
  for (let i = 0; i < count; i++) {
    options.push(buildFY(startYear - i));
  }
  return options;
};
