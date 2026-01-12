import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Property } from "@/hooks/useProperties";
import { formatINR } from "@/lib/currency";
import { Building2, MapPin, Edit, Trash2, Users } from "lucide-react";

interface PropertyCardProps {
  property: Property;
  onEdit: (property: Property) => void;
  onDelete: (id: string) => void;
  onViewTenants: (property: Property) => void;
}

const statusColors: Record<string, string> = {
  occupied: "glow",
  vacant: "secondary",
  maintenance: "destructive",
};

const propertyTypeIcons: Record<string, string> = {
  apartment: "🏢",
  house: "🏠",
  commercial: "🏬",
  land: "🌍",
  other: "🏗️",
};

const PropertyCard = ({ property, onEdit, onDelete, onViewTenants }: PropertyCardProps) => {
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
        <Badge variant={statusColors[property.status] as "glow" | "secondary" | "destructive"}>
          {property.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mt-2">
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
          <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{property.notes}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default PropertyCard;
