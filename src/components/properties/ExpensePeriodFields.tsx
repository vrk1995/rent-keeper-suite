import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { computeToDate, decomposeTenure, tenureUnitLabel, TenureUnit } from "@/lib/expensePeriod";

interface ExpensePeriodFieldsProps {
  periodFrom: Date | undefined;
  periodTo: Date | undefined;
  onChange: (from: Date | undefined, to: Date | undefined) => void;
}

/** Optional "coverage period" for expenses that span a stretch of time (insurance, tax,
 *  AMC contracts) rather than a single date. From-date + tenure auto-fills the to-date;
 *  entering (or changing) the to-date directly auto-fills the tenure instead. Whichever
 *  the user touches last drives the other, so this never fights their last edit. */
export function ExpensePeriodFields({ periodFrom, periodTo, onChange }: ExpensePeriodFieldsProps) {
  const [tenureValue, setTenureValue] = useState("");
  const [tenureUnit, setTenureUnit] = useState<TenureUnit>("years");
  // Tracks the (from, to) pair this component itself last derived from a tenure edit, so
  // the sync effect below doesn't immediately overwrite what the user just typed.
  const lastFromTenure = useRef<{ from?: number; to?: number }>({});

  useEffect(() => {
    if (!periodFrom || !periodTo) return;
    if (lastFromTenure.current.from === periodFrom.getTime() && lastFromTenure.current.to === periodTo.getTime()) {
      return;
    }
    const t = decomposeTenure(periodFrom, periodTo);
    setTenureValue(t.value > 0 ? String(t.value) : "");
    setTenureUnit(t.unit);
  }, [periodFrom, periodTo]);

  const handleFromChange = (date: Date | undefined) => {
    const tenureNum = Number(tenureValue);
    if (date && tenureValue && tenureNum > 0) {
      const to = computeToDate(date, tenureNum, tenureUnit);
      lastFromTenure.current = { from: date.getTime(), to: to.getTime() };
      onChange(date, to);
    } else {
      onChange(date, periodTo);
    }
  };

  const handleToChange = (date: Date | undefined) => {
    onChange(periodFrom, date);
  };

  const handleTenureValueChange = (value: string) => {
    setTenureValue(value);
    const tenureNum = Number(value);
    if (periodFrom && value && tenureNum > 0) {
      const to = computeToDate(periodFrom, tenureNum, tenureUnit);
      lastFromTenure.current = { from: periodFrom.getTime(), to: to.getTime() };
      onChange(periodFrom, to);
    }
  };

  const handleTenureUnitChange = (unit: TenureUnit) => {
    setTenureUnit(unit);
    const tenureNum = Number(tenureValue);
    if (periodFrom && tenureValue && tenureNum > 0) {
      const to = computeToDate(periodFrom, tenureNum, unit);
      lastFromTenure.current = { from: periodFrom.getTime(), to: to.getTime() };
      onChange(periodFrom, to);
    }
  };

  const handleClear = () => {
    setTenureValue("");
    setTenureUnit("years");
    lastFromTenure.current = {};
    onChange(undefined, undefined);
  };

  const hasAnyValue = !!periodFrom || !!periodTo || !!tenureValue;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <FormLabel className="text-sm">Coverage Period (optional)</FormLabel>
        {hasAnyValue && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleClear}>
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        For expenses that cover a stretch of time, like insurance or tax — e.g. 1 Apr 2020 to 31 Mar 2021.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FormLabel className="text-xs font-normal text-muted-foreground">From</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn("w-full pl-3 text-left font-normal", !periodFrom && "text-muted-foreground")}
              >
                {periodFrom ? format(periodFrom, "PP") : <span>Pick a date</span>}
                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={periodFrom} onSelect={handleFromChange} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <FormLabel className="text-xs font-normal text-muted-foreground">To</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn("w-full pl-3 text-left font-normal", !periodTo && "text-muted-foreground")}
              >
                {periodTo ? format(periodTo, "PP") : <span>Pick a date</span>}
                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={periodTo}
                onSelect={handleToChange}
                disabled={periodFrom ? { before: periodFrom } : undefined}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-1.5">
        <FormLabel className="text-xs font-normal text-muted-foreground">Tenure</FormLabel>
        <div className="flex gap-2">
          <Input
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 1"
            value={tenureValue}
            onChange={(e) => handleTenureValueChange(e.target.value)}
            className="flex-1"
          />
          <Select value={tenureUnit} onValueChange={(v) => handleTenureUnitChange(v as TenureUnit)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(tenureUnitLabel) as TenureUnit[]).map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {tenureUnitLabel[unit]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
