import { useState } from "react";

export type SortDirection = "asc" | "desc";

/** Shared sort state for list pages: which field, and which direction. Clicking the same
 *  field again flips direction; clicking a different field switches to it, ascending. */
export function useSortState<T extends string>(defaultField: T, defaultDirection: SortDirection = "asc") {
  const [field, setField] = useState<T>(defaultField);
  const [direction, setDirection] = useState<SortDirection>(defaultDirection);

  const toggleSort = (key: T) => {
    if (key === field) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setField(key);
      setDirection("asc");
    }
  };

  /** dir(1) for asc, dir(-1) for desc — multiply straight into a comparator's return value. */
  const dir = direction === "asc" ? 1 : -1;

  return { field, direction, dir, toggleSort };
}
