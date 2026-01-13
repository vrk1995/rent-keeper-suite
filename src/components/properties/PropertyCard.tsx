import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Property } from "@/hooks/useProperties";
import { PropertyFloor } from "@/hooks/usePropertyFloors";
import { MapPin, Edit, Trash2, Layers, Square, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface PropertyCardProps {
  property: Property;
  floors?: PropertyFloor[];
  rentedSqft?: number;
  floorRentedMap?: Map<string, number>; // floor_id -> rented sqft
  unitCount?: number;
  isExpanded?: boolean;
  onEdit: (property: Property) => void;
  onDelete: (id: string) => void;
  onViewTenants: (property: Property) => void;
  onAddUnit?: () => void;
}

const statusColors: Record<string, string> = {
  occupied: "glow",
  vacant: "secondary",
  partial: "default",
  maintenance: "destructive",
};

const propertyTypeIcons: Record<string, string> = {
  apartment: "🏢",
  house: "🏠",
  commercial: "🏬",
  land: "🌍",
  floor: "🏗️",
  other: "🏗️",
};

const PropertyCard = ({ 
  property, 
  floors = [],
  rentedSqft = 0, 
  floorRentedMap = new Map(),
  unitCount = 0,
  isExpanded = false,
  onEdit, 
  onDelete, 
  onViewTenants,
  onAddUnit,
}: PropertyCardProps) => {
  const [floorExpanded, setFloorExpanded] = useState(floors.length > 0);
  const totalSqft = property.total_sqft || 0;
  const utilizationPercent = totalSqft > 0 ? Math.min(100, (rentedSqft / totalSqft) * 100) : 0;
  const vacantSqft = Math.max(0, totalSqft - rentedSqft);

  // Show floor-level breakdown if multiple floors exist
  const hasMultipleFloors = floors.length > 1;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-primary" />
            ) : (
              <ChevronRight className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
            {propertyTypeIcons[property.property_type] || "🏗️"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{property.name}</h3>
              <Badge variant={statusColors[property.status] as "glow" | "secondary" | "destructive" | "default"}>
                {property.status}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {property.address}
              </span>
              {property.floors_owned > 0 && (
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {property.floors_owned} floor{property.floors_owned !== 1 ? "s" : ""}
                </span>
              )}
              {totalSqft > 0 && (
                <span className="flex items-center gap-1">
                  <Square className="w-3 h-3" />
                  {totalSqft.toLocaleString()} sq.ft
                </span>
              )}
              {unitCount > 0 && (
                <span>{unitCount} unit{unitCount !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onAddUnit && (
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
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(property);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(property.id);
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      
      {/* Floor-level utilization for multiple floors */}
      {hasMultipleFloors && totalSqft > 0 && (
        <div className="mt-3 ml-[88px]">
          <Collapsible open={floorExpanded} onOpenChange={setFloorExpanded}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="p-2 h-auto text-xs w-full justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-muted-foreground flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  Floor Utilization
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {utilizationPercent.toFixed(0)}% overall
                  </span>
                  {floorExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="space-y-3 rounded-lg bg-muted/30 p-3">
                {floors.map((floor) => {
                  const floorRented = floorRentedMap.get(floor.id) || 0;
                  const floorUtilization = floor.floor_sqft > 0 
                    ? Math.min(100, (floorRented / floor.floor_sqft) * 100) 
                    : 0;
                  const floorVacant = Math.max(0, floor.floor_sqft - floorRented);
                  
                  return (
                    <div key={floor.id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Floor {floor.floor_name}</span>
                        <span className="text-muted-foreground">
                          {floor.floor_sqft.toLocaleString()} sq.ft
                        </span>
                      </div>
                      <Progress value={floorUtilization} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="text-green-600 dark:text-green-400">
                          Rented: {floorRented.toLocaleString()} sq.ft ({floorUtilization.toFixed(0)}%)
                        </span>
                        <span className="text-orange-600 dark:text-orange-400">
                          Vacant: {floorVacant.toLocaleString()} sq.ft
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                {/* Summary */}
                <div className="pt-2 border-t border-border/50 space-y-1">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total</span>
                    <span>{totalSqft.toLocaleString()} sq.ft</span>
                  </div>
                  <Progress value={utilizationPercent} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="text-green-600 dark:text-green-400">
                      Rented: {rentedSqft.toLocaleString()} sq.ft ({utilizationPercent.toFixed(0)}%)
                    </span>
                    <span className="text-orange-600 dark:text-orange-400">
                      Vacant: {vacantSqft.toLocaleString()} sq.ft
                    </span>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Simple utilization bar for single floor */}
      {!hasMultipleFloors && totalSqft > 0 && (
        <div className="mt-3 ml-[88px] space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Utilization: {utilizationPercent.toFixed(0)}%</span>
            <span className="text-muted-foreground">
              Rented: {rentedSqft.toLocaleString()} | Vacant: {vacantSqft.toLocaleString()} sq.ft
            </span>
          </div>
          <Progress value={utilizationPercent} className="h-2" />
        </div>
      )}
    </div>
  );
};

export default PropertyCard;
