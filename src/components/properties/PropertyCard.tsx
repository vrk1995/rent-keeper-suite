import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Property } from "@/hooks/useProperties";
import { PropertyFloor } from "@/hooks/usePropertyFloors";
import { PropertyOwnerShare } from "@/hooks/usePropertyOwnerShares";
import { MapPin, Edit, Trash2, Layers, Square, ChevronDown, ChevronRight, IndianRupee, Users } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatINR } from "@/lib/currency";
import { occupancyStatusConfig } from "@/lib/statusConfig";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PropertyCardProps {
  property: Property;
  floors?: PropertyFloor[];
  ownerShares?: PropertyOwnerShare[];
  rentedSqft?: number;
  floorRentedMap?: Map<string, number>; // floor_id -> rented sqft
  unitCount?: number;
  totalRentWithoutGST?: number;
  totalRentWithGST?: number;
  hasGSTTenants?: boolean;
  onEdit: (property: Property) => void;
  onDelete: (id: string) => void;
  onViewTenants: (property: Property) => void;
}

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
  ownerShares = [],
  rentedSqft = 0, 
  floorRentedMap = new Map(),
  unitCount = 0,
  totalRentWithoutGST = 0,
  totalRentWithGST = 0,
  hasGSTTenants = false,
  onEdit, 
  onDelete, 
  onViewTenants,
}: PropertyCardProps) => {
  const [floorExpanded, setFloorExpanded] = useState(floors.length > 0);
  const totalSqft = property.total_sqft || 0;
  const utilizationPercent = totalSqft > 0 ? Math.min(100, (rentedSqft / totalSqft) * 100) : 0;
  const vacantSqft = Math.max(0, totalSqft - rentedSqft);

  // Show floor-level breakdown if multiple floors exist
  const hasMultipleFloors = floors.length > 1;
  const hasMultipleOwners = ownerShares.length > 0;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
            {propertyTypeIcons[property.property_type] || "🏗️"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{property.name}</h3>
              <Badge variant={occupancyStatusConfig[property.status] || "secondary"}>
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
                <span className="flex items-center gap-2">
                  <Square className="w-3 h-3" />
                  {rentedSqft.toLocaleString()}/{totalSqft.toLocaleString()} sq.ft
                  <span className="flex items-center gap-1.5">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${utilizationPercent}%` }}
                      />
                    </div>
                    <span className="text-xs">{utilizationPercent.toFixed(0)}%</span>
                  </span>
                </span>
              )}
              {unitCount > 0 && (
                <span>{unitCount} unit{unitCount !== 1 ? "s" : ""}</span>
              )}
              {hasMultipleOwners && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 cursor-help">
                        <Users className="w-3 h-3" />
                        {ownerShares.length} owner{ownerShares.length !== 1 ? "s" : ""}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="space-y-1">
                        {ownerShares.map((share) => (
                          <div key={share.id} className="flex justify-between gap-4 text-sm">
                            <span>{share.property_owners?.name || "Unknown"}</span>
                            <span className="font-medium">{share.share_percentage}%</span>
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Rent Summary - Right side, larger, green */}
          {totalRentWithoutGST > 0 && (
            <div className="text-right">
              <div className="flex items-center gap-1 text-lg font-bold text-success">
                <IndianRupee className="w-4 h-4" />
                {formatINR(totalRentWithoutGST)}
              </div>
              {hasGSTTenants && (
                <div className="text-xs text-muted-foreground">
                  With GST: {formatINR(totalRentWithGST)}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
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
                        <span className="text-success">
                          Rented: {floorRented.toLocaleString()} sq.ft ({floorUtilization.toFixed(0)}%)
                        </span>
                        <span className="text-warning">
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
                    <span className="text-success">
                      Rented: {rentedSqft.toLocaleString()} sq.ft ({utilizationPercent.toFixed(0)}%)
                    </span>
                    <span className="text-warning">
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
