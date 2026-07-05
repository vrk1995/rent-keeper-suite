import { usePropertyOwners } from "@/hooks/usePropertyOwners";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

const OwnerFilterSelect = () => {
  const { data: owners = [] } = usePropertyOwners();
  const { selectedOwnerId, setSelectedOwnerId } = useOwnerFilter();

  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-muted-foreground" />
      <Select
        value={selectedOwnerId || "all"}
        onValueChange={(value) => setSelectedOwnerId(value === "all" ? null : value)}
      >
        <SelectTrigger className="w-auto min-w-0 max-w-[45vw] sm:w-[200px] sm:max-w-none bg-secondary/50 border-white/10">
          <SelectValue placeholder="Filter by owner" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Owners</SelectItem>
          {owners
            .filter((owner) => owner.id && owner.id.trim() !== "")
            .map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default OwnerFilterSelect;
