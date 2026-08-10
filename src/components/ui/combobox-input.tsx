import * as React from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ComboboxInputProps extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Previously used values to suggest — the user can still type anything not in this list. */
  suggestions: string[];
  emptyMessage?: string;
}

/** A free-text input with a scrollable dropdown of prior values — pick one, or just keep
 *  typing to enter something new. Unlike Select, the value is never locked to the list. */
export const ComboboxInput = React.forwardRef<HTMLInputElement, ComboboxInputProps>(
  ({ value, onValueChange, suggestions, emptyMessage = "No matches — keep typing to add a new one", className, onFocus, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);

    const filtered = React.useMemo(() => {
      const q = value.trim().toLowerCase();
      const list = q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions;
      return list.filter((s) => s.toLowerCase() !== q).slice(0, 8);
    }, [value, suggestions]);

    return (
      <Popover open={open}>
        <PopoverAnchor asChild>
          <Input
            ref={ref}
            value={value}
            onChange={(e) => {
              onValueChange(e.target.value);
              setOpen(true);
            }}
            onFocus={(e) => {
              setOpen(true);
              onFocus?.(e);
            }}
            onBlur={() => setOpen(false)}
            autoComplete="off"
            className={className}
            {...props}
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-[--radix-popover-anchor-width] p-1 max-h-56 overflow-y-auto"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyMessage}</p>
          ) : (
            filtered.map((s) => (
              <button
                key={s}
                type="button"
                className={cn(
                  "w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground"
                )}
                // Fires before the input's blur closes the popover, so the click still registers.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onValueChange(s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>
    );
  }
);
ComboboxInput.displayName = "ComboboxInput";
