import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBuildingsWithUnits, useDeleteBuilding, useDeleteUnit, Building, Unit } from "@/hooks/useBuildings";
import { useTenants } from "@/hooks/useTenants";
import { AddBuildingDialog } from "@/components/buildings/AddBuildingDialog";
import { AddUnitDialog } from "@/components/buildings/AddUnitDialog";
import { BuildingCard } from "@/components/buildings/BuildingCard";
import { UnitCard } from "@/components/buildings/UnitCard";
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

const Buildings = () => {
  const { data: buildings, isLoading } = useBuildingsWithUnits();
  const { data: tenants } = useTenants();
  const deleteBuilding = useDeleteBuilding();
  const deleteUnit = useDeleteUnit();

  const [searchQuery, setSearchQuery] = useState("");
  const [buildingDialogOpen, setBuildingDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [editBuilding, setEditBuilding] = useState<Building | null>(null);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [deleteBuilding_, setDeleteBuilding] = useState<Building | null>(null);
  const [deleteUnit_, setDeleteUnit] = useState<Unit | null>(null);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());

  // Create a map of unit_id to tenant name for quick lookup
  const unitTenantMap = new Map<string, string>();
  tenants?.forEach((tenant) => {
    if (tenant.unit_id) {
      unitTenantMap.set(tenant.unit_id, tenant.name);
    }
  });

  const filteredBuildings = buildings?.filter(
    (building) =>
      building.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      building.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleBuilding = (buildingId: string) => {
    setExpandedBuildings((prev) => {
      const next = new Set(prev);
      if (next.has(buildingId)) {
        next.delete(buildingId);
      } else {
        next.add(buildingId);
      }
      return next;
    });
  };

  const handleEditBuilding = (building: Building) => {
    setEditBuilding(building);
    setBuildingDialogOpen(true);
  };

  const handleAddUnit = (buildingId: string) => {
    setSelectedBuildingId(buildingId);
    setEditUnit(null);
    setUnitDialogOpen(true);
  };

  const handleEditUnit = (unit: Unit) => {
    setEditUnit(unit);
    setSelectedBuildingId(unit.building_id);
    setUnitDialogOpen(true);
  };

  const handleAddTenantToUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    setTenantDialogOpen(true);
  };

  const handleDeleteBuilding = async () => {
    if (deleteBuilding_) {
      await deleteBuilding.mutateAsync(deleteBuilding_.id);
      setDeleteBuilding(null);
    }
  };

  const handleDeleteUnit = async () => {
    if (deleteUnit_) {
      await deleteUnit.mutateAsync(deleteUnit_.id);
      setDeleteUnit(null);
    }
  };

  const handleBuildingDialogClose = (open: boolean) => {
    setBuildingDialogOpen(open);
    if (!open) setEditBuilding(null);
  };

  const handleUnitDialogClose = (open: boolean) => {
    setUnitDialogOpen(open);
    if (!open) {
      setEditUnit(null);
      setSelectedBuildingId(null);
    }
  };

  const handleTenantDialogClose = (open: boolean) => {
    setTenantDialogOpen(open);
    if (!open) {
      setSelectedUnitId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Buildings</h1>
          <p className="text-muted-foreground">
            Manage your multi-unit buildings and their units
          </p>
        </div>
        <Button onClick={() => setBuildingDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Building
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search buildings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredBuildings?.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No buildings yet</h3>
          <p className="mt-2 text-muted-foreground">
            Add your first building to start managing multi-unit properties.
          </p>
          <Button onClick={() => setBuildingDialogOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Add Building
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {filteredBuildings?.map((building, index) => (
            <motion.div
              key={building.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Collapsible
                open={expandedBuildings.has(building.id)}
                onOpenChange={() => toggleBuilding(building.id)}
              >
                <div className="border rounded-lg bg-card">
                  <CollapsibleTrigger asChild>
                    <div className="cursor-pointer">
                      <BuildingCard
                        building={building}
                        unitCount={building.units?.length || 0}
                        isExpanded={expandedBuildings.has(building.id)}
                        onEdit={() => handleEditBuilding(building)}
                        onDelete={() => setDeleteBuilding(building)}
                        onAddUnit={() => handleAddUnit(building.id)}
                      />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 pt-2 border-t">
                      {building.units && building.units.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {building.units.map((unit) => (
                            <UnitCard
                              key={unit.id}
                              unit={unit}
                              tenantName={unitTenantMap.get(unit.id)}
                              onEdit={() => handleEditUnit(unit)}
                              onDelete={() => setDeleteUnit(unit)}
                              onAddTenant={() => handleAddTenantToUnit(unit.id)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          <p>No units added yet.</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddUnit(building.id)}
                            className="mt-2"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add First Unit
                          </Button>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </motion.div>
          ))}
        </div>
      )}

      <AddBuildingDialog
        open={buildingDialogOpen}
        onOpenChange={handleBuildingDialogClose}
        editBuilding={editBuilding}
      />

      <AddUnitDialog
        open={unitDialogOpen}
        onOpenChange={handleUnitDialogClose}
        buildingId={selectedBuildingId}
        editUnit={editUnit}
      />

      <AddTenantDialog
        open={tenantDialogOpen}
        onOpenChange={handleTenantDialogClose}
        defaultUnitId={selectedUnitId || undefined}
      />

      <AlertDialog open={!!deleteBuilding_} onOpenChange={() => setDeleteBuilding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Building</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteBuilding_?.name}"? This will also
              delete all units in this building. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBuilding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteUnit_} onOpenChange={() => setDeleteUnit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteUnit_?.name}"? This action cannot
              be undone.
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

export default Buildings;
