import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Building2, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProperties, useDeleteProperty, Property } from "@/hooks/useProperties";
import { useTenants } from "@/hooks/useTenants";
import { usePropertiesWithUnits, useDeleteUnit, Unit } from "@/hooks/useUnits";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PropertyCard from "@/components/properties/PropertyCard";
import AddPropertyDialog from "@/components/properties/AddPropertyDialog";
import { AddUnitDialog } from "@/components/units/AddUnitDialog";
import { UnitCard } from "@/components/units/UnitCard";
import AddTenantDialog from "@/components/tenants/AddTenantDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const Properties = () => {
  const { data: propertiesWithUnits, isLoading } = usePropertiesWithUnits();
  const { data: tenants } = useTenants();
  const deleteProperty = useDeleteProperty();
  const deleteUnit = useDeleteUnit();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteUnitData, setDeleteUnitData] = useState<Unit | null>(null);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());

  // Fetch all floors for all properties
  const { data: allFloors } = useQuery({
    queryKey: ["all-property-floors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_floors")
        .select("*")
        .order("floor_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Create maps for tenant data
  const { propertyRentedSqft, floorRentedMap, unitTenantMap, unitRentedSqftMap } = useMemo(() => {
    const propMap = new Map<string, number>();
    const floorMap = new Map<string, number>();
    const tenantMap = new Map<string, string>();
    const unitSqftMap = new Map<string, number>();
    
    tenants?.forEach((tenant) => {
      if (tenant.property_id && !tenant.unit_id) {
        const current = propMap.get(tenant.property_id) || 0;
        propMap.set(tenant.property_id, current + (tenant.rented_sqft || 0));
      }
      if (tenant.unit_id) {
        tenantMap.set(tenant.unit_id, tenant.name);
        const current = unitSqftMap.get(tenant.unit_id) || 0;
        unitSqftMap.set(tenant.unit_id, current + (tenant.rented_sqft || 0));
      }
    });
    
    return { 
      propertyRentedSqft: propMap, 
      floorRentedMap: floorMap,
      unitTenantMap: tenantMap,
      unitRentedSqftMap: unitSqftMap
    };
  }, [tenants]);

  // Group floors by property
  const floorsByProperty = useMemo(() => {
    const map = new Map<string, typeof allFloors>();
    allFloors?.forEach((floor) => {
      const existing = map.get(floor.property_id) || [];
      map.set(floor.property_id, [...existing, floor]);
    });
    return map;
  }, [allFloors]);

  const filteredProperties = propertiesWithUnits?.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleProperty = (propertyId: string) => {
    setExpandedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  const handleEdit = (property: Property) => {
    setEditProperty(property);
    setDialogOpen(true);
  };

  const handleAddUnit = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setEditUnit(null);
    setUnitDialogOpen(true);
  };

  const handleEditUnit = (unit: Unit) => {
    setEditUnit(unit);
    setSelectedPropertyId(unit.property_id);
    setUnitDialogOpen(true);
  };

  const handleAddTenantToUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    setTenantDialogOpen(true);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteProperty.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleDeleteUnit = async () => {
    if (deleteUnitData) {
      await deleteUnit.mutateAsync(deleteUnitData.id);
      setDeleteUnitData(null);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditProperty(null);
  };

  const handleUnitDialogClose = (open: boolean) => {
    setUnitDialogOpen(open);
    if (!open) {
      setEditUnit(null);
      setSelectedPropertyId(null);
    }
  };

  const handleTenantDialogClose = (open: boolean) => {
    setTenantDialogOpen(open);
    if (!open) {
      setSelectedUnitId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Properties</h1>
          <p className="text-muted-foreground">Manage your rental properties and units</p>
        </div>
        <Button variant="hero" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Property
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search properties..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-secondary/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredProperties?.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No properties yet</h3>
          <p className="text-muted-foreground mb-4">
            Add your first property to start tracking rents
          </p>
          <Button variant="hero" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Property
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {filteredProperties?.map((property, index) => {
            const hasUnits = property.units && property.units.length > 0;
            const isExpanded = expandedProperties.has(property.id);
            
            return (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Collapsible
                  open={isExpanded}
                  onOpenChange={() => toggleProperty(property.id)}
                >
                  <div className="border rounded-xl bg-card overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <div className="cursor-pointer">
                        <PropertyCard
                          property={property}
                          floors={floorsByProperty.get(property.id) || []}
                          rentedSqft={propertyRentedSqft.get(property.id) || 0}
                          floorRentedMap={floorRentedMap}
                          unitCount={property.units?.length || 0}
                          isExpanded={isExpanded}
                          onEdit={handleEdit}
                          onDelete={(id) => setDeleteId(id)}
                          onViewTenants={() => {}}
                          onAddUnit={() => handleAddUnit(property.id)}
                        />
                      </div>
                    </CollapsibleTrigger>
                    {hasUnits && (
                      <CollapsibleContent>
                        <div className="px-4 pb-4 pt-2 border-t">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                              <Layers className="w-4 h-4" />
                              Units ({property.units?.length})
                            </h4>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddUnit(property.id);
                              }}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Add Unit
                            </Button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {property.units?.map((unit: Unit) => (
                              <UnitCard
                                key={unit.id}
                                unit={unit}
                                tenantName={unitTenantMap.get(unit.id)}
                                rentedSqft={unitRentedSqftMap.get(unit.id) || 0}
                                onEdit={() => handleEditUnit(unit)}
                                onDelete={() => setDeleteUnitData(unit)}
                                onAddTenant={() => handleAddTenantToUnit(unit.id)}
                              />
                            ))}
                          </div>
                        </div>
                      </CollapsibleContent>
                    )}
                  </div>
                </Collapsible>
              </motion.div>
            );
          })}
        </div>
      )}

      <AddPropertyDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editProperty={editProperty}
      />

      <AddUnitDialog
        open={unitDialogOpen}
        onOpenChange={handleUnitDialogClose}
        propertyId={selectedPropertyId}
        editUnit={editUnit}
      />

      <AddTenantDialog
        open={tenantDialogOpen}
        onOpenChange={handleTenantDialogClose}
        defaultUnitId={selectedUnitId || undefined}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this property and all associated data including units, tenants, payments, and documents. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteUnitData} onOpenChange={() => setDeleteUnitData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteUnitData?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUnit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Properties;
