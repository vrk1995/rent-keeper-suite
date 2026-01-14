import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, AlertCircle, Info, Building2, Plus, Check, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useCreateTenant, useUpdateTenant, Tenant, useTenants } from "@/hooks/useTenants";
import { useProperties } from "@/hooks/useProperties";
import { usePropertiesWithUnits } from "@/hooks/useUnits";
import { usePropertyFloors } from "@/hooks/usePropertyFloors";
import { useBillingAddresses, useCreateBillingAddress } from "@/hooks/useBillingAddresses";
import { usePropertyOwnerShares } from "@/hooks/usePropertyOwnerShares";
import { cn } from "@/lib/utils";

const tenantSchema = z.object({
  assignment_type: z.enum(["property", "unit"]),
  property_id: z.string().optional(),
  unit_id: z.string().optional(),
  floor_id: z.string().optional(),
  property_owner_id: z.string().optional(),
  name: z.string().min(1, "Tenant name is required").max(100),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(15).optional(),
  move_in_date: z.date({ required_error: "Move-in date is required" }),
  lease_start_date: z.date({ required_error: "Lease start date is required" }),
  lease_end_date: z.date({ required_error: "Lease end date is required" }),
  security_deposit: z.coerce.number().min(0).optional(),
  rented_sqft: z.coerce.number().min(0).optional(),
  monthly_rent: z.coerce.number().min(0, "Rent must be positive"),
  rent_due_day: z.coerce.number().min(1).max(28, "Due day must be between 1-28"),
  requires_gst: z.boolean(),
  // Billing details
  bill_from_name: z.string().max(100).optional(),
  bill_from_address: z.string().max(500).optional(),
  bill_from_gstin: z.string().max(15).optional(),
  bill_to_name: z.string().max(100).optional(),
  bill_to_address: z.string().max(500).optional(),
  bill_to_gstin: z.string().max(15).optional(),
}).refine((data) => {
  if (data.assignment_type === "property") return !!data.property_id;
  if (data.assignment_type === "unit") return !!data.unit_id;
  return true;
}, {
  message: "Please select a property or unit",
  path: ["property_id"],
});

type TenantFormValues = z.infer<typeof tenantSchema>;

interface AddTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTenant?: Tenant | null;
  defaultPropertyId?: string;
  defaultUnitId?: string;
}

const AddTenantDialog = ({ 
  open, 
  onOpenChange, 
  editTenant, 
  defaultPropertyId,
  defaultUnitId 
}: AddTenantDialogProps) => {
  const createTenant = useCreateTenant();
  const updateTenant = useUpdateTenant();
  const { data: properties } = useProperties();
  const { data: propertiesWithUnits } = usePropertiesWithUnits();
  const { data: allTenants } = useTenants();
  const { data: billingAddresses } = useBillingAddresses();
  const createBillingAddress = useCreateBillingAddress();
  
  const [saveAsNewAddress, setSaveAsNewAddress] = useState(false);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<string | null>(null);
  
  const getDefaultAssignmentType = () => {
    if (editTenant?.unit_id || defaultUnitId) return "unit";
    return "property";
  };

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    editTenant?.property_id || defaultPropertyId || null
  );
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(
    editTenant?.floor_id || null
  );
  
  const { data: floors } = usePropertyFloors(selectedPropertyId);
  const { data: ownerShares } = usePropertyOwnerShares(selectedPropertyId || undefined);

  // Check if property has multiple owners
  const hasMultipleOwners = (ownerShares?.length || 0) > 1;

  // Get default billing address
  const defaultBillingAddress = billingAddresses?.find(a => a.is_default);

  // Handle selecting a saved billing address
  const handleSelectBillingAddress = (addressId: string) => {
    if (addressId === "new") {
      setSelectedBillingAddressId(null);
      form.setValue("bill_from_name", "");
      form.setValue("bill_from_address", "");
      form.setValue("bill_from_gstin", "");
      return;
    }
    
    const address = billingAddresses?.find(a => a.id === addressId);
    if (address) {
      setSelectedBillingAddressId(addressId);
      form.setValue("bill_from_name", address.name);
      form.setValue("bill_from_address", address.address || "");
      form.setValue("bill_from_gstin", address.gstin || "");
    }
  };

  // Calculate available capacity for the selected property/floor
  const capacityInfo = useMemo(() => {
    if (!selectedPropertyId || !properties) return null;

    const property = properties.find(p => p.id === selectedPropertyId);
    if (!property) return null;

    // Get all tenants for this property (excluding current tenant if editing)
    const propertyTenants = allTenants?.filter(t => 
      t.property_id === selectedPropertyId && 
      t.id !== editTenant?.id
    ) || [];

    // Calculate total rented sqft at property level
    const totalRentedSqft = propertyTenants.reduce((sum, t) => sum + (t.rented_sqft || 0), 0);
    const propertyTotalSqft = Number(property.total_sqft) || 0;
    const propertyAvailable = propertyTotalSqft - totalRentedSqft;

    // Calculate floor-wise breakdown if floors exist
    let floorBreakdown: { id: string; name: string; total: number; rented: number; available: number }[] = [];
    
    if (floors && floors.length > 0) {
      floorBreakdown = floors.map(floor => {
        const floorTenants = propertyTenants.filter(t => t.floor_id === floor.id);
        const floorRented = floorTenants.reduce((sum, t) => sum + (t.rented_sqft || 0), 0);
        const floorTotal = Number(floor.floor_sqft) || 0;
        return {
          id: floor.id,
          name: floor.floor_name,
          total: floorTotal,
          rented: floorRented,
          available: floorTotal - floorRented,
        };
      });
    }

    // Get specific floor info if selected
    const selectedFloor = selectedFloorId 
      ? floorBreakdown.find(f => f.id === selectedFloorId) 
      : null;

    return {
      propertyTotal: propertyTotalSqft,
      propertyRented: totalRentedSqft,
      propertyAvailable,
      floorBreakdown,
      selectedFloor,
    };
  }, [selectedPropertyId, selectedFloorId, properties, floors, allTenants, editTenant?.id]);
  
  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      assignment_type: getDefaultAssignmentType(),
      property_id: editTenant?.property_id || defaultPropertyId || "",
      unit_id: editTenant?.unit_id || defaultUnitId || "",
      floor_id: editTenant?.floor_id || "",
      property_owner_id: editTenant?.property_owner_id || "",
      name: editTenant?.name || "",
      email: editTenant?.email || "",
      phone: editTenant?.phone || "",
      move_in_date: editTenant?.move_in_date ? new Date(editTenant.move_in_date) : undefined,
      lease_start_date: editTenant?.lease_start_date ? new Date(editTenant.lease_start_date) : undefined,
      lease_end_date: editTenant?.lease_end_date ? new Date(editTenant.lease_end_date) : undefined,
      security_deposit: editTenant?.security_deposit || 0,
      rented_sqft: editTenant?.rented_sqft || 0,
      monthly_rent: editTenant?.monthly_rent || 0,
      rent_due_day: editTenant?.rent_due_day || 1,
      requires_gst: editTenant?.requires_gst || false,
      bill_from_name: editTenant?.bill_from_name || "",
      bill_from_address: editTenant?.bill_from_address || "",
      bill_from_gstin: editTenant?.bill_from_gstin || "",
      bill_to_name: editTenant?.bill_to_name || "",
      bill_to_address: editTenant?.bill_to_address || "",
      bill_to_gstin: editTenant?.bill_to_gstin || "",
    },
  });

  const assignmentType = form.watch("assignment_type");
  const watchedPropertyId = form.watch("property_id");

  // Update selectedPropertyId when property changes
  useEffect(() => {
    if (assignmentType === "property" && watchedPropertyId) {
      setSelectedPropertyId(watchedPropertyId);
    }
  }, [watchedPropertyId, assignmentType]);

  // When selecting a unit, get its property_id for floor selection
  useEffect(() => {
    if (assignmentType === "unit") {
      const unitId = form.watch("unit_id");
      const unit = propertiesWithUnits?.flatMap(p => p.units || []).find((u: any) => u.id === unitId);
      if (unit) {
        setSelectedPropertyId(unit.property_id);
      }
    }
  }, [form.watch("unit_id"), assignmentType, propertiesWithUnits]);

  // Track floor selection
  const watchedFloorId = form.watch("floor_id");
  useEffect(() => {
    setSelectedFloorId(watchedFloorId || null);
  }, [watchedFloorId]);

  useEffect(() => {
    if (open) {
      setSelectedPropertyId(editTenant?.property_id || defaultPropertyId || null);
      setSelectedFloorId(editTenant?.floor_id || null);
      setSaveAsNewAddress(false);
      
      // Pre-select billing address if editing or use default
      if (editTenant?.bill_from_name) {
        // Try to find matching saved address
        const matchingAddress = billingAddresses?.find(
          a => a.name === editTenant.bill_from_name && 
               a.address === editTenant.bill_from_address &&
               a.gstin === editTenant.bill_from_gstin
        );
        setSelectedBillingAddressId(matchingAddress?.id || null);
      } else if (defaultBillingAddress) {
        setSelectedBillingAddressId(defaultBillingAddress.id);
      } else {
        setSelectedBillingAddressId(null);
      }
      
      form.reset({
        assignment_type: getDefaultAssignmentType(),
        property_id: editTenant?.property_id || defaultPropertyId || "",
        unit_id: editTenant?.unit_id || defaultUnitId || "",
        floor_id: editTenant?.floor_id || "",
        property_owner_id: editTenant?.property_owner_id || "",
        name: editTenant?.name || "",
        email: editTenant?.email || "",
        phone: editTenant?.phone || "",
        move_in_date: editTenant?.move_in_date ? new Date(editTenant.move_in_date) : undefined,
        lease_start_date: editTenant?.lease_start_date ? new Date(editTenant.lease_start_date) : undefined,
        lease_end_date: editTenant?.lease_end_date ? new Date(editTenant.lease_end_date) : undefined,
        security_deposit: editTenant?.security_deposit || 0,
        rented_sqft: editTenant?.rented_sqft || 0,
        monthly_rent: editTenant?.monthly_rent || 0,
        rent_due_day: editTenant?.rent_due_day || 1,
        requires_gst: editTenant?.requires_gst || false,
        bill_from_name: editTenant?.bill_from_name || defaultBillingAddress?.name || "",
        bill_from_address: editTenant?.bill_from_address || defaultBillingAddress?.address || "",
        bill_from_gstin: editTenant?.bill_from_gstin || defaultBillingAddress?.gstin || "",
        bill_to_name: editTenant?.bill_to_name || "",
        bill_to_address: editTenant?.bill_to_address || "",
        bill_to_gstin: editTenant?.bill_to_gstin || "",
      });
    }
  }, [open, editTenant, defaultPropertyId, defaultUnitId, form, billingAddresses, defaultBillingAddress]);

  const onSubmit = async (values: TenantFormValues) => {
    // Auto-save billing address if checkbox is checked and address has a name
    if (saveAsNewAddress && values.bill_from_name && !selectedBillingAddressId) {
      // Check if this address already exists
      const existingAddress = billingAddresses?.find(
        a => a.name === values.bill_from_name
      );
      
      if (!existingAddress) {
        try {
          await createBillingAddress.mutateAsync({
            name: values.bill_from_name,
            address: values.bill_from_address || undefined,
            gstin: values.bill_from_gstin || undefined,
          });
        } catch (error) {
          // Continue even if saving billing address fails
          console.error("Failed to save billing address:", error);
        }
      }
    }

    // Get property_id from unit if assignment type is unit
    let propertyId = values.property_id;
    if (values.assignment_type === "unit" && values.unit_id) {
      const unit = propertiesWithUnits?.flatMap(p => p.units || []).find((u: any) => u.id === values.unit_id);
      propertyId = unit?.property_id || properties?.[0]?.id || "";
    }

    const payload = {
      property_id: propertyId!,
      unit_id: values.assignment_type === "unit" ? values.unit_id : undefined,
      floor_id: values.floor_id || undefined,
      property_owner_id: values.property_owner_id || undefined,
      name: values.name,
      email: values.email || undefined,
      phone: values.phone,
      move_in_date: format(values.move_in_date, "yyyy-MM-dd"),
      lease_start_date: format(values.lease_start_date, "yyyy-MM-dd"),
      lease_end_date: format(values.lease_end_date, "yyyy-MM-dd"),
      security_deposit: values.security_deposit,
      rented_sqft: values.rented_sqft,
      monthly_rent: values.monthly_rent,
      rent_due_day: values.rent_due_day,
      requires_gst: values.requires_gst,
      bill_from_name: values.bill_from_name || undefined,
      bill_from_address: values.bill_from_address || undefined,
      bill_from_gstin: values.bill_from_gstin || undefined,
      bill_to_name: values.bill_to_name || undefined,
      bill_to_address: values.bill_to_address || undefined,
      bill_to_gstin: values.bill_to_gstin || undefined,
    };

    if (editTenant) {
      await updateTenant.mutateAsync({ id: editTenant.id, ...payload });
    } else {
      await createTenant.mutateAsync(payload);
    }
    form.reset();
    setSaveAsNewAddress(false);
    onOpenChange(false);
  };

  // Flatten units for easy selection
  const allUnits = propertiesWithUnits?.flatMap(property => 
    property.units?.map((unit: any) => ({
      ...unit,
      property_id: property.id,
      displayName: `${property.name} - ${unit.name}`,
    })) || []
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTenant ? "Edit Tenant" : "Add New Tenant"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="assignment_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign To</FormLabel>
                  <Tabs value={field.value} onValueChange={field.onChange} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="property">Property</TabsTrigger>
                      <TabsTrigger value="unit">Property Unit</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </FormItem>
              )}
            />

            {assignmentType === "property" ? (
              <FormField
                control={form.control}
                name="property_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select property" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {properties?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="unit_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allUnits.map((unit: any) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Floor Selection - only show if property has floors */}
            {floors && floors.length > 0 && (
              <FormField
                control={form.control}
                name="floor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select floor (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {floors.map((floor) => {
                          const floorInfo = capacityInfo?.floorBreakdown.find(f => f.id === floor.id);
                          return (
                            <SelectItem key={floor.id} value={floor.id}>
                              {floor.floor_name}
                              {floorInfo && (
                                <span className="text-muted-foreground ml-2 text-xs">
                                  ({floorInfo.available.toLocaleString()} sq.ft available)
                                </span>
                              )}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Owner Selection - only show if property has multiple owners */}
            {hasMultipleOwners && (
              <FormField
                control={form.control}
                name="property_owner_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Assign to Owner
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner for this tenant" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ownerShares
                          ?.filter((share) => share.owner_id && share.owner_id.trim() !== "")
                          .map((share) => (
                            <SelectItem key={share.owner_id} value={share.owner_id}>
                              {share.property_owners?.name} ({share.share_percentage}%)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Available Capacity Info */}
            {capacityInfo && assignmentType === "property" && (
              <Alert className="bg-muted/50 border-primary/20">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div className="font-medium">
                      Property: {capacityInfo.propertyAvailable.toLocaleString()} sq.ft available 
                      <span className="text-muted-foreground font-normal">
                        {" "}(of {capacityInfo.propertyTotal.toLocaleString()} total)
                      </span>
                    </div>
                    {capacityInfo.floorBreakdown.length > 0 && (
                      <div className="text-sm text-muted-foreground grid grid-cols-2 gap-x-4 mt-2">
                        {capacityInfo.floorBreakdown.map(floor => (
                          <div 
                            key={floor.id} 
                            className={cn(
                              "flex justify-between",
                              selectedFloorId === floor.id && "text-foreground font-medium"
                            )}
                          >
                            <span>{floor.name}:</span>
                            <span className={floor.available <= 0 ? "text-destructive" : ""}>
                              {floor.available.toLocaleString()} sq.ft
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tenant Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+91 98765 43210" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Rent Details Section */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h4 className="font-medium text-sm">Rent Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="monthly_rent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Rent (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="25000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rent_due_day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rent Due Day</FormLabel>
                      <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                            <SelectItem key={day} value={String(day)}>
                              {day}{day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"} of each month
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="requires_gst"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>GST Invoice Required</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Enable if tenant requires GST invoice for rent
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Billing Details Section - Collapsible */}
            <details className="border rounded-lg bg-muted/30 group" open={billingAddresses && billingAddresses.length > 0}>
              <summary className="p-4 cursor-pointer font-medium text-sm flex items-center justify-between list-none">
                <span>Billing Details (Optional)</span>
                <span className="text-xs text-muted-foreground group-open:hidden">Click to expand</span>
              </summary>
              <div className="px-4 pb-4 space-y-4">
                {/* Bill From Section */}
                <div className="space-y-3">
                  <h5 className="text-sm font-medium text-muted-foreground">Bill From (Your details)</h5>
                  
                  {/* Saved Billing Address Selector */}
                  {billingAddresses && billingAddresses.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm">Select Saved Address</Label>
                      <Select 
                        value={selectedBillingAddressId || "new"} 
                        onValueChange={handleSelectBillingAddress}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a saved address">
                            {selectedBillingAddressId ? (
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4" />
                                {billingAddresses.find(a => a.id === selectedBillingAddressId)?.name}
                                {billingAddresses.find(a => a.id === selectedBillingAddressId)?.is_default && (
                                  <span className="text-xs text-primary">(Default)</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Enter new address</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">
                            <div className="flex items-center gap-2">
                              <Plus className="w-4 h-4" />
                              Enter new address
                            </div>
                          </SelectItem>
                          {billingAddresses.map((address) => (
                            <SelectItem key={address.id} value={address.id}>
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4" />
                                <span>{address.name}</span>
                                {address.is_default && (
                                  <Check className="w-3 h-3 text-primary" />
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="bill_from_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company / Person Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="ABC Properties Pvt. Ltd." 
                            {...field} 
                            onChange={(e) => {
                              field.onChange(e);
                              // Clear selected address if user starts typing
                              if (selectedBillingAddressId) {
                                setSelectedBillingAddressId(null);
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bill_from_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="123 Main Street, City - 400001" 
                            {...field} 
                            onChange={(e) => {
                              field.onChange(e);
                              if (selectedBillingAddressId) {
                                setSelectedBillingAddressId(null);
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bill_from_gstin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GSTIN (if applicable)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="22AAAAA0000A1Z5" 
                            maxLength={15} 
                            {...field} 
                            onChange={(e) => {
                              field.onChange(e);
                              if (selectedBillingAddressId) {
                                setSelectedBillingAddressId(null);
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Save new address checkbox */}
                  {!selectedBillingAddressId && form.watch("bill_from_name") && (
                    <div className="flex items-center space-x-2 p-3 rounded-lg border bg-background">
                      <Checkbox
                        id="save-address"
                        checked={saveAsNewAddress}
                        onCheckedChange={(checked) => setSaveAsNewAddress(checked === true)}
                      />
                      <Label 
                        htmlFor="save-address" 
                        className="text-sm cursor-pointer flex-1"
                      >
                        Save this address for future use
                      </Label>
                    </div>
                  )}
                </div>

                {/* Bill To Section */}
                <div className="space-y-3 pt-3 border-t">
                  <h5 className="text-sm font-medium text-muted-foreground">Bill To (Tenant details)</h5>
                  <FormField
                    control={form.control}
                    name="bill_to_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company / Person Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Tenant Company Pvt. Ltd." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bill_to_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="456 Business Park, City - 400002" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bill_to_gstin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GSTIN (if applicable)</FormLabel>
                        <FormControl>
                          <Input placeholder="22BBBBB0000B1Z5" maxLength={15} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </details>

            <FormField
              control={form.control}
              name="move_in_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Move-in Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="lease_start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Lease Start</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "PP") : <span>Pick date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lease_end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Lease End</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "PP") : <span>Pick date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="security_deposit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Security Deposit (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="50000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rented_sqft"
                render={({ field }) => {
                  const maxAvailable = capacityInfo?.selectedFloor 
                    ? capacityInfo.selectedFloor.available 
                    : capacityInfo?.propertyAvailable;
                  const isOverCapacity = maxAvailable !== undefined && (field.value || 0) > maxAvailable;
                  
                  return (
                    <FormItem>
                      <FormLabel>Rented Sq. Ft.</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0}
                          max={maxAvailable}
                          placeholder="1500" 
                          className={isOverCapacity ? "border-destructive focus-visible:ring-destructive" : ""}
                          {...field} 
                        />
                      </FormControl>
                      {maxAvailable !== undefined && (
                        <p className={cn(
                          "text-xs",
                          isOverCapacity ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {isOverCapacity 
                            ? `Exceeds available capacity by ${((field.value || 0) - maxAvailable).toLocaleString()} sq.ft` 
                            : `Max available: ${maxAvailable.toLocaleString()} sq.ft`}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="hero"
                disabled={createTenant.isPending || updateTenant.isPending}
              >
                {editTenant ? "Update Tenant" : "Add Tenant"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddTenantDialog;