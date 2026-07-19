import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/hooks/useSortState";

interface SortableTableHeadProps<T extends string> {
  label: string;
  sortKey: T;
  currentField: T;
  currentDirection: SortDirection;
  onSort: (key: T) => void;
  className?: string;
  align?: "left" | "right";
}

/** A clickable column header: click toggles ascending/descending on that column, with a
 *  small arrow icon showing the active direction (a neutral icon when not the active sort). */
export function SortableTableHead<T extends string>({
  label,
  sortKey,
  currentField,
  currentDirection,
  onSort,
  className,
  align = "left",
}: SortableTableHeadProps<T>) {
  const isActive = currentField === sortKey;
  return (
    <TableHead className={cn("select-none p-0", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex w-full items-center gap-1 h-12 px-4 hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse justify-end",
          isActive ? "text-foreground font-medium" : "text-muted-foreground"
        )}
      >
        {label}
        {isActive ? (
          currentDirection === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
