import { ArrowUp, ArrowDown, ArrowUpDown, ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SortDirection } from "@/hooks/useSortState";

interface SortOption<T extends string> {
  value: T;
  label: string;
}

interface SortMenuButtonProps<T extends string> {
  options: SortOption<T>[];
  currentField: T;
  currentDirection: SortDirection;
  onSort: (key: T) => void;
  className?: string;
}

/** Compact "Sort" trigger for places without clickable column headers (e.g. mobile card
 *  lists) — same click-to-toggle-direction behavior as SortableTableHead, in a menu. */
export function SortMenuButton<T extends string>({
  options,
  currentField,
  currentDirection,
  onSort,
  className,
}: SortMenuButtonProps<T>) {
  const activeLabel = options.find((o) => o.value === currentField)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <ArrowDownUp className="w-4 h-4 mr-2" />
          Sort: {activeLabel}
          {currentDirection === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5 ml-1.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 ml-1.5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((opt) => {
          const isActive = opt.value === currentField;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => onSort(opt.value)}
              className="flex items-center justify-between gap-4"
            >
              <span className={isActive ? "font-medium" : undefined}>{opt.label}</span>
              {isActive ? (
                currentDirection === "asc" ? (
                  <ArrowUp className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDown className="w-3.5 h-3.5" />
                )
              ) : (
                <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
