/** Always renders in IST, regardless of the viewer's own browser/OS timezone — used for
 *  audit-trail timestamps where "when this actually happened" must stay consistent for
 *  every viewer, not shift with whoever's looking. */
export const formatIST = (timestamp: string): string => {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp)) + " IST";
};
