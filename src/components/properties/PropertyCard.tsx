import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Property } from "@/hooks/useProperties";
import { PropertyFloor } from "@/hooks/usePropertyFloors";
import { formatINR } from "@/lib/currency";
import { MapPin, Edit, Trash2, Users, Layers, Square, ChevronDown, ChevronRight } from "lucide-react";
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
  onEdit: (property: Property) => void;
  onDelete: (id: string) => void;
  onViewTenants: (property: Property) => void;
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
  onEdit, 
  onDelete, 
  onViewTenants 
}: PropertyCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const totalSqft = property.total_sqft || 0;
  const utilizationPercent = totalSqft > 0 ? Math.min(100, (rentedSqft / totalSqft) * 100) : 0;
  const vacantSqft = Math.max(0, totalSqft - rentedSqft);

  return (
    <Card className="hover:border-primary/30 transition-all group">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
            {propertyTypeIcons[property.property_type] || "🏗️"}
          </div>
          <div>
            <CardTitle className="text-lg">{property.name}</CardTitle>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin className="w-3 h-3" />
              {property.address}
            </div>
          </div>
        </div>
        <Badge variant={statusColors[property.status] as "glow" | "secondary" | "destructive" | "default"}>
          {property.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Floors and Sqft info */}
        <div className="flex gap-4 text-sm">
          {property.floors_owned > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Layers className="w-3 h-3" />
              {property.floors_owned} floor{property.floors_owned !== 1 ? "s" : ""}
            </div>
          )}
          {totalSqft > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Square className="w-3 h-3" />
              {totalSqft.toLocaleString()} sq.ft
            </div>
          )}
        </div>

        {/* Utilization bar */}
        {totalSqft > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Utilization</span>
              <span className="font-medium">{utilizationPercent.toFixed(0)}%</span>
            </div>
            <Progress value={utilizationPercent} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Rented: {rentedSqft.toLocaleString()} sq.ft</span>
              <span>Vacant: {vacantSqft.toLocaleString()} sq.ft</span>
            </div>
          </div>
        )}

        {/* Floor-wise breakdown (collapsible) */}
        {floors.length > 0 && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between p-2 h-auto">
                <span className="text-xs text-muted-foreground">Floor Details</span>
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="space-y-2 rounded-lg bg-muted/30 p-2">
                {floors.map((floor) => {
                  const floorRented = floorRentedMap.get(floor.id) || 0;
                  const floorUtilization = floor.floor_sqft > 0 
                    ? Math.min(100, (floorRented / floor.floor_sqft) * 100) 
                    : 0;
                  const floorVacant = Math.max(0, floor.floor_sqft - floorRented);
                  
                  return (
                    <div key={floor.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">Floor {floor.floor_name}</span>
                        <span className="text-muted-foreground">
                          {floor.floor_sqft.toLocaleString()} sq.ft
                        </span>
                      </div>
                      <Progress value={floorUtilization} className="h-1" />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Rented: {floorRented.toLocaleString()}</span>
                        <span>Vacant: {floorVacant.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex items-center justify-between pt-2">
          <div>
            <p className="text-sm text-muted-foreground">Monthly Rent</p>
            <p className="text-2xl font-display font-bold text-primary">
              {formatINR(property.monthly_rent)}
            </p>
          </div>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" onClick={() => onViewTenants(property)}>
              <Users className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onEdit(property)}>
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(property.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>
        {property.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2">{property.notes}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default PropertyCard;
