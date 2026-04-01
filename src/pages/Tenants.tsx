import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { format, differenceInDays } from "date-fns";
import { Plus, Search, Users, Mail, Phone, Calendar, AlertTriangle, Building2, IndianRupee, Receipt, Trash2, Filter, TrendingUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenants, useDeleteTenant, Tenant } from "@/hooks/useTenants";
import { useAllTenantOwnerShares } from "@/hooks/useTenantOwnerShares";
import { useIsAdmin } from "@/hooks/useTeam";
import AddTenantDialog from "@/components/tenants/AddTenantDialog";
import { formatINR } from "@/lib/currency";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
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

const Tenants = () => {
  const { data: tenants, isLoading } = useTenants();
  const { allOwnerShares: tenantOwnerShares } = useAllTenantOwnerShares();
  const deleteTenant = useDeleteTenant();
  const { isAdmin } = useIsAdmin();
  const { selectedOwnerId } = useOwnerFilter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Group tenant owner shares by tenant_id
  const ownerSharesByTenant = useMemo(() => {
    const map = new Map<string, typeof tenantOwnerShares>();
    tenantOwnerShares?.forEach((share) => {
      const existing = map.get(share.tenant_id) || [];
      map.set(share.tenant_id, [...existing, share]);
    });
    return map;
  }, [tenantOwnerShares]);

  // Extract unique properties for the filter
  const propertyOptions = useMemo(() => {
    const map = new Map<string, string>();
    (tenants || []).forEach((t) => {
      if (t.property?.name) {
        map.set(t.property_id, t.property.name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tenants]);

  const filteredTenants = useMemo(() => {
    let filtered = tenants || [];
    
    // Filter by owner
    if (selectedOwnerId) {
      filtered = filtered.filter(t => {
        if (t.property_owner_id === selectedOwnerId) return true;
        if (t.property?.property_owner_id === selectedOwnerId) return true;
        const shares = ownerSharesByTenant.get(t.id) || [];
        return shares.some(s => s.owner_id === selectedOwnerId);
      });
    }

    // Filter by property
    if (selectedPropertyId && selectedPropertyId !== "all") {
      filtered = filtered.filter(
        (t) => t.property_id === selectedPropertyId
      );
    }
    
    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.property?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return filtered;
  }, [tenants, selectedOwnerId, selectedPropertyId, searchQuery, ownerSharesByTenant]);

  const handleEdit = (tenant: Tenant) => {
    setEditTenant(tenant);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteTenant.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditTenant(null);
  };

  const getLeaseStatus = (endDate: string) => {
    const daysLeft = differenceInDays(new Date(endDate), new Date());
    if (daysLeft < 0) return { label: "Expired", variant: "destructive" as const };
    if (daysLeft <= 30) return { label: `${daysLeft}d left`, variant: "secondary" as const };
    return { label: "Active", variant: "glow" as const };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Tenants</h1>
          <p className="text-muted-foreground">Manage your tenants and leases</p>
        </div>
        <Button variant="hero" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Tenant
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tenants..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {propertyOptions.length > 1 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
              <SelectTrigger className="w-[200px] bg-secondary/50 border-white/10">
                <SelectValue placeholder="Filter by property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {propertyOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-secondary/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredTenants?.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No tenants yet</h3>
          <p className="text-muted-foreground mb-4">
            Add your first tenant to start tracking leases
          </p>
          <Button variant="hero" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Tenant
          </Button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filteredTenants?.map((tenant, index) => {
            const leaseStatus = getLeaseStatus(tenant.lease_end_date);
            return (
              <motion.div
                key={tenant.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:border-primary/30 transition-all cursor-pointer" onClick={() => handleEdit(tenant)}>
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <div>
                      <CardTitle className="text-lg">{tenant.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {tenant.unit ? (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {tenant.unit.building?.name} - {tenant.unit.name}
                          </span>
                        ) : (
                          tenant.property?.name
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={leaseStatus.variant}>
                        {leaseStatus.label}
                      </Badge>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(tenant.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Rent Details */}
                    <div className="flex items-center justify-between bg-primary/5 rounded-lg p-2">
                      <div className="flex items-center gap-2">
                        <IndianRupee className="w-4 h-4 text-primary" />
                        <span className="font-semibold">{formatINR(tenant.monthly_rent || 0)}/mo</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        Due: {tenant.rent_due_day || 1}{tenant.rent_due_day === 1 ? "st" : tenant.rent_due_day === 2 ? "nd" : tenant.rent_due_day === 3 ? "rd" : "th"}
                        {tenant.requires_gst && (
                          <Badge variant="outline" className="text-xs ml-1">
                            <Receipt className="w-3 h-3 mr-1" />
                            GST
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Floor info */}
                    {tenant.floor && (
                      <div className="text-sm text-muted-foreground">
                        Floor: {tenant.floor.floor_name}
                      </div>
                    )}

                    {tenant.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        {tenant.email}
                      </div>
                    )}
                    {tenant.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-4 h-4" />
                        {tenant.phone}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      Lease: {format(new Date(tenant.lease_start_date), "MMM d, yyyy")} - {format(new Date(tenant.lease_end_date), "MMM d, yyyy")}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="text-sm text-muted-foreground">Security Deposit</span>
                      <span className="font-semibold">{formatINR(tenant.security_deposit)}</span>
                    </div>
                    {leaseStatus.variant !== "glow" && (
                      <div className="flex items-center gap-2 text-warning text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        Lease renewal needed
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <AddTenantDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editTenant={editTenant}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this tenant and all associated payment records. This action cannot be undone.
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
    </div>
  );
};

export default Tenants;
