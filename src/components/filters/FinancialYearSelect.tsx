import { useFinancialYear } from "@/contexts/FinancialYearContext";
import { getFinancialYearOptions } from "@/lib/financialYear";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon } from "lucide-react";

const options = getFinancialYearOptions(5);

const FinancialYearSelect = () => {
  const { selectedFY, setSelectedFY } = useFinancialYear();

  return (
    <div className="flex items-center gap-2">
      <CalendarIcon className="w-4 h-4 text-muted-foreground hidden sm:block" />
      <Select
        value={selectedFY?.value ?? "all"}
        onValueChange={(val) => {
          if (val === "all") {
            setSelectedFY(null);
          } else {
            const fy = options.find((o) => o.value === val);
            if (fy) setSelectedFY(fy);
          }
        }}
      >
        <SelectTrigger className="w-[130px] bg-secondary/50 border-white/10 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Years</SelectItem>
          {options.map((fy) => (
            <SelectItem key={fy.value} value={fy.value}>
              {fy.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default FinancialYearSelect;
