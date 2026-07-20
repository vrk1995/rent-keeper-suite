import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Search, Building2, IndianRupee, TrendingUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProperties, useDeleteProperty, Property } from "@/hooks/useProperties";
import { useTenants } from "@/hooks/useTenants";
import { usePropertiesWithUnits, useDeleteUnit, Unit } from "@/hooks/useUnits";
import { usePayments } from "@/hooks/usePayments";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PropertyCard from "@/components/properties/PropertyCard";
import { PropertyDetailSheet } from "@/components/properties/PropertyDetailSheet";
import AddPropertyDialog from "@/components/properties/AddPropertyDialog";
import { AddUnitDialog } from "@/components/units/AddUnitDialog";
import AddTenantDialog from "@/components/tenants/AddTenantDialog";
import { formatINR } from "@/lib/currency";
import { Tenant } from "@/hooks/useTenants";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { PropertyOwnerShare } from "@/hooks/usePropertyOwnerShares";
import { useIsAdmin } from "@/hooks/useTeam";
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
import { ErrorState } from "@/components/ui/error-state";

const Properties = () => {
  const { data: propertiesWithUnits, isLoading, isError, refetch } = usePropertiesWithUnits();
  const { data: tenants } = useTenants();
  const { data: payments } = usePayments();
  const { selectedOwnerId } = useOwnerFilter();
  const deleteProperty = useDeleteProperty();
  const deleteUnit = useDeleteUnit();
  const { isAdmin } = useIsAdmin();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteUnitData, setDeleteUnitData] = useState<Unit | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

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

  // Fetch all owner shares for all properties
  const { data: allOwnerShares } = useQuery({
    queryKey: ["all-property-owner-shares"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_owner_shares")
        .select(`
          *,
          property_owners (
            id,
            name,
            gstin,
            billing_address
          )
        `)
        .order("share_percentage", { ascending: false });
      if (error) throw error;
      return data as PropertyOwnerShare[];
    },
  });

  // Create maps for tenant data and rent calculations
  // When an owner is selected, we calculate metrics based on:
  // 1. Tenants directly assigned to that owner (property_owner_id matches)
  // 2. Share percentage for overall property metrics
  const { 
    propertyRentedSqft, 
    ownerRentedSqft,
    floorRentedMap, 
    unitTenantMap, 
    unitRentedSqftMap, 
    propertyRentData, 
    ownerRentData,
    tenantsByProperty 
  } = useMemo(() => {
    const propMap = new Map<string, number>();
    const ownerSqftMap = new Map<string, Map<string, number>>(); // property_id -> owner_id -> sqft
    const floorMap = new Map<string, number>();
    const tenantMap = new Map<string, string>();
    const unitSqftMap = new Map<string, number>();
    const rentData = new Map<string, { withoutGST: number; withGST: number; hasGST: boolean }>();
    const ownerRentMap = new Map<string, Map<string, { withoutGST: number; withGST: number; hasGST: boolean }>>(); // property_id -> owner_id -> rent
    const tenantsByProp = new Map<string, Tenant[]>();
    
    tenants?.forEach((tenant) => {
      const rentedSqft = tenant.rented_sqft || 0;
      const monthlyRent = tenant.monthly_rent || 0;
      const requiresGST = tenant.requires_gst || false;
      
      // Group tenants by property
      if (tenant.property_id) {
        const existing = tenantsByProp.get(tenant.property_id) || [];
        tenantsByProp.set(tenant.property_id, [...existing, tenant]);
      }
      
      // Calculate rent per property (total)
      if (tenant.property_id && tenant.status === 'active') {
        const current = rentData.get(tenant.property_id) || { withoutGST: 0, withGST: 0, hasGST: false };
        current.withoutGST += monthlyRent;
        current.withGST += requiresGST ? monthlyRent * 1.18 : monthlyRent;
        if (requiresGST) current.hasGST = true;
        rentData.set(tenant.property_id, current);

        // Track owner-specific rent if tenant has a property_owner_id
        if (tenant.property_owner_id) {
          if (!ownerRentMap.has(tenant.property_id)) {
            ownerRentMap.set(tenant.property_id, new Map());
          }
          const propertyOwnerRent = ownerRentMap.get(tenant.property_id)!;
          const ownerCurrent = propertyOwnerRent.get(tenant.property_owner_id) || { withoutGST: 0, withGST: 0, hasGST: false };
          ownerCurrent.withoutGST += monthlyRent;
          ownerCurrent.withGST += requiresGST ? monthlyRent * 1.18 : monthlyRent;
          if (requiresGST) ownerCurrent.hasGST = true;
          propertyOwnerRent.set(tenant.property_owner_id, ownerCurrent);
        }
      }
      
      // Aggregate by floor_id for floor-level utilization (vacated tenants don't occupy space)
      if (tenant.floor_id && tenant.status === 'active') {
        const currentFloor = floorMap.get(tenant.floor_id) || 0;
        floorMap.set(tenant.floor_id, currentFloor + rentedSqft);
      }

      // Aggregate by property (sum ALL active tenant sqft for property-level total)
      if (tenant.property_id && !tenant.unit_id && tenant.status === 'active') {
        const current = propMap.get(tenant.property_id) || 0;
        propMap.set(tenant.property_id, current + rentedSqft);

        // Track owner-specific sqft if tenant has a property_owner_id
        if (tenant.property_owner_id) {
          if (!ownerSqftMap.has(tenant.property_id)) {
            ownerSqftMap.set(tenant.property_id, new Map());
          }
          const propertyOwnerSqft = ownerSqftMap.get(tenant.property_id)!;
          const ownerCurrent = propertyOwnerSqft.get(tenant.property_owner_id) || 0;
          propertyOwnerSqft.set(tenant.property_owner_id, ownerCurrent + rentedSqft);
        }
      }

      // Aggregate by unit
      if (tenant.unit_id && tenant.status === 'active') {
        tenantMap.set(tenant.unit_id, tenant.name);
        const current = unitSqftMap.get(tenant.unit_id) || 0;
        unitSqftMap.set(tenant.unit_id, current + rentedSqft);
      }
    });
    
    return { 
      propertyRentedSqft: propMap, 
      ownerRentedSqft: ownerSqftMap,
      floorRentedMap: floorMap,
      unitTenantMap: tenantMap,
      unitRentedSqftMap: unitSqftMap,
      propertyRentData: rentData,
      ownerRentData: ownerRentMap,
      tenantsByProperty: tenantsByProp
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

  // Group owner shares by property
  const ownerSharesByProperty = useMemo(() => {
    const map = new Map<string, PropertyOwnerShare[]>();
    allOwnerShares?.forEach((share) => {
      const existing = map.get(share.property_id) || [];
      map.set(share.property_id, [...existing, share]);
    });
    return map;
  }, [allOwnerShares]);

  // Filter properties by owner and search
  // When filtering by owner, include properties where:
  // 1. The owner is the primary property_owner_id, OR
  // 2. The owner has a share in property_owner_shares
  const filteredProperties = useMemo(() => {
    let props = propertiesWithUnits || [];
    
    // Filter by selected owner
    if (selectedOwnerId) {
      props = props.filter(p => {
        // Check if owner is primary owner
        if (p.property_owner_id === selectedOwnerId) return true;
        // Check if owner has a share in this property
        const shares = ownerSharesByProperty.get(p.id) || [];
        return shares.some(s => s.owner_id === selectedOwnerId);
      });
    }
    
    // Filter by search query
    if (searchQuery) {
      props = props.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.address.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== "all") {
      props = props.filter((p) => p.status === statusFilter);
    }

    // Filter by property type
    if (typeFilter !== "all") {
      props = props.filter((p) => p.property_type === typeFilter);
    }

    return props;
  }, [propertiesWithUnits, selectedOwnerId, searchQuery, statusFilter, typeFilter, ownerSharesByProperty]);

  // Get owner share percentage for a property
  const getOwnerSharePercentage = useMemo(() => {
    return (propertyId: string, ownerId: string): number => {
      const shares = ownerSharesByProperty.get(propertyId) || [];
      const share = shares.find(s => s.owner_id === ownerId);
      return share?.share_percentage || 100; // Default to 100% if no shares defined
    };
  }, [ownerSharesByProperty]);

  // Filter tenants and payments based on filtered properties and owner assignment
  const filteredTenants = useMemo(() => {
    if (!selectedOwnerId) return tenants;
    const propertyIds = new Set(filteredProperties?.map(p => p.id) || []);
    // Filter to tenants in filtered properties AND (assigned to this owner OR no owner assigned)
    return tenants?.filter(t => {
      if (!propertyIds.has(t.property_id)) return false;
      // Include if tenant is assigned to selected owner, or if no owner is assigned
      return t.property_owner_id === selectedOwnerId || !t.property_owner_id;
    });
  }, [tenants, filteredProperties, selectedOwnerId]);

  const filteredPayments = useMemo(() => {
    if (!selectedOwnerId) return payments;
    // Get tenant IDs from filtered tenants
    const tenantIds = new Set(filteredTenants?.map(t => t.id) || []);
    return payments?.filter(p => tenantIds.has(p.tenant_id));
  }, [payments, filteredTenants, selectedOwnerId]);

  // Recalculate rent summary with filtered data and owner share percentages
  const rentSummary = useMemo(() => {
    const activeTenants = filteredTenants?.filter(t => t.status === 'active') || [];
    
    // Calculate totals, applying share percentage for tenants without specific owner assignment
    let totalCollectible = 0;
    activeTenants.forEach(t => {
      if (selectedOwnerId && !t.property_owner_id) {
        // Tenant not assigned to any owner - apply share percentage
        const sharePercent = getOwnerSharePercentage(t.property_id, selectedOwnerId);
        totalCollectible += (t.monthly_rent || 0) * (sharePercent / 100);
      } else {
        // Tenant is assigned to this owner (or no filter) - full amount
        totalCollectible += t.monthly_rent || 0;
      }
    });
    
    const currentMonth = new Date();
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const currentMonthPayments = filteredPayments?.filter(p => {
      const dueDate = p.due_date;
      return dueDate >= monthStart && dueDate <= monthEnd;
    }) || [];
    
    let totalReceived = 0;
    let totalDue = 0;
    
    currentMonthPayments.forEach(p => {
      const tenant = tenants?.find(t => t.id === p.tenant_id);
      let amount = p.amount || 0;
      
      // Apply share percentage if tenant not assigned to specific owner
      if (selectedOwnerId && tenant && !tenant.property_owner_id) {
        const sharePercent = getOwnerSharePercentage(p.property_id, selectedOwnerId);
        amount = amount * (sharePercent / 100);
      }
      
      if (p.status === 'paid') {
        totalReceived += amount;
      } else if (p.status === 'pending' || p.status === 'overdue') {
        totalDue += amount;
      }
    });
    
    return { totalCollectible, totalReceived, totalDue };
  }, [filteredTenants, filteredPayments, selectedOwnerId, tenants, getOwnerSharePercentage]);

  const handlePropertyClick = (property: Property) => {
    setSelectedProperty(property);
    setDetailSheetOpen(true);
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
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Properties</h1>
          <p className="text-sm md:text-base text-muted-foreground">Manage your rental properties and units</p>
        </div>
        {isAdmin && (
          <Button variant="hero" size="sm" className="w-fit" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Property
          </Button>
        )}
      </div>

      {/* Rent Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <IndianRupee className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Collectible/Month</p>
                <p className="text-xl font-bold">{formatINR(rentSummary.totalCollectible)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Due This Month</p>
                <p className="text-xl font-bold text-warning">{formatINR(rentSummary.totalDue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Received This Month</p>
                <p className="text-xl font-bold text-success">{formatINR(rentSummary.totalReceived)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search properties..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="occupied">Occupied</SelectItem>
            <SelectItem value="vacant">Vacant</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="apartment">Apartment</SelectItem>
            <SelectItem value="house">House</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="land">Land</SelectItem>
            <SelectItem value="floor">Floor</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-secondary/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
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
          {isAdmin && (
            <Button variant="hero" onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Property
            </Button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredProperties?.map((property, index) => {
            const rentData = propertyRentData.get(property.id);
            
            return (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div 
                  className="border rounded-xl bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handlePropertyClick(property)}
                >
                  <PropertyCard
                    property={property}
                    floors={floorsByProperty.get(property.id) || []}
                    ownerShares={ownerSharesByProperty.get(property.id) || []}
                    rentedSqft={propertyRentedSqft.get(property.id) || 0}
                    floorRentedMap={floorRentedMap}
                    unitCount={property.units?.length || 0}
                    totalRentWithoutGST={rentData?.withoutGST || 0}
                    totalRentWithGST={rentData?.withGST || 0}
                    hasGSTTenants={rentData?.hasGST || false}
                    onEdit={handleEdit}
                    onDelete={(id) => setDeleteId(id)}
                    onViewTenants={() => {}}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Property Detail Sheet */}
      <PropertyDetailSheet
        property={selectedProperty}
        tenants={selectedProperty ? tenantsByProperty.get(selectedProperty.id) || [] : []}
        floors={selectedProperty ? floorsByProperty.get(selectedProperty.id) || [] : []}
        floorRentedMap={floorRentedMap}
        rentData={selectedProperty ? propertyRentData.get(selectedProperty.id) : undefined}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        onDeleteProperty={(id) => setDeleteId(id)}
      />

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
