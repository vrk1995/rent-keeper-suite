import { DoorOpen, Store, Layers, Pencil, Trash2, UserPlus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Unit } from "@/hooks/useBuildings";
import { formatINR } from "@/lib/currency";

interface UnitCardProps {
  unit: Unit;
  tenantName?: string;
  onEdit: () => void;
  onDelete: () => void;
  onAddTenant?: () => void;
}

const unitTypeIcons: Record<string, React.ReactNode> = {
  full_floor: <Layers className="h-4 w-4" />,
  partial_floor: <Layers className="h-4 w-4" />,
  room: <DoorOpen className="h-4 w-4" />,
  shop: <Store className="h-4 w-4" />,
  commercial: <Store className="h-4 w-4" />,
};

const unitTypeLabels: Record<string, string> = {
  full_floor: "Full Floor",
  partial_floor: "Partial Floor",
  room: "Room",
  shop: "Shop",
  commercial: "Commercial",
};

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  vacant: "secondary",
  occupied: "default",
  maintenance: "destructive",
};

export const UnitCard = ({ unit, tenantName, onEdit, onDelete, onAddTenant }: UnitCardProps) => {
  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-muted">
              {unitTypeIcons[unit.unit_type] || <DoorOpen className="h-4 w-4" />}
            </div>
            <div>
              <h4 className="font-medium">{unit.name}</h4>
              <p className="text-xs text-muted-foreground">
                {unitTypeLabels[unit.unit_type] || unit.unit_type}
                {unit.floor_number !== null && ` • Floor ${unit.floor_number}`}
              </p>
            </div>
          </div>
          <Badge variant={statusColors[unit.status] || "secondary"}>
            {unit.status}
          </Badge>
        </div>
        
        {tenantName && (
          <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
            <User className="h-3 w-3" />
            <span>{tenantName}</span>
          </div>
        )}
        
        <div className="mt-3 flex items-center justify-between">
          <span className="font-semibold text-primary">
            {formatINR(unit.monthly_rent)}/mo
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {unit.status === "vacant" && onAddTenant && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onAddTenant} title="Add Tenant">
                <UserPlus className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
