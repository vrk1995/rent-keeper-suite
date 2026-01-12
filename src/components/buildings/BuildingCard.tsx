import { Building2, MapPin, Layers, ChevronDown, ChevronRight, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Building } from "@/hooks/useBuildings";

interface BuildingCardProps {
  building: Building;
  unitCount: number;
  isExpanded: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddUnit: () => void;
}

export const BuildingCard = ({
  building,
  unitCount,
  isExpanded,
  onEdit,
  onDelete,
  onAddUnit,
}: BuildingCardProps) => {
  return (
    <div className="p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-primary" />
          ) : (
            <ChevronRight className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold truncate">{building.name}</h3>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {building.address}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {building.total_floors} floor{building.total_floors !== 1 ? "s" : ""}
            </span>
            <span>{unitCount} unit{unitCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onAddUnit();
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Unit
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
};
