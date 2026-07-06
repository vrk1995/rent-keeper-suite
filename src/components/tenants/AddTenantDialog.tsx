import { useEffect, useState, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, AlertCircle, Info, Building2, Plus, Check, Users, Trash2, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { useFloorUnitsByProperty } from "@/hooks/useFloorUnits";
import { useTenantFloorUnits, useAllTenantFloorUnits } from "@/hooks/useTenantFloorUnits";
import { useBillingAddresses, useCreateBillingAddress } from "@/hooks/useBillingAddresses";
import { usePropertyOwnerShares } from "@/hooks/usePropertyOwnerShares";
import { useTenantOwnerShares } from "@/hooks/useTenantOwnerShares";
import { usePropertyOwners } from "@/hooks/usePropertyOwners";
import { cn } from "@/lib/utils";

const ownerShareSchema = z.object({
  owner_id: z.string().min(1, "Owner is required"),
  share_percentage: z.coerce.number().min(0.01, "Must be greater than 0").max(100, "Cannot exceed 100%"),
});

const tenantSchema = z.object({
  assignment_type: z.enum(["property", "unit"]),
  property_id: z.string().optional(),
  unit_id: z.string().optional(),
  floor_id: z.string().optional(),
  floor_unit_ids: z.array(z.string()).optional(),
  property_owner_id: z.string().optional(),
  owner_shares: z.array(ownerShareSchema).optional(),
  name: z.string().min(1, "Tenant name is required").max(100),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(15).optional(),
  move_in_date: z.date({ required_error: "Move-in date is required" }),
  lease_start_date: z.date({ required_error: "Lease start date is required" }),
  lease_end_date: z.date({ required_error: "Lease end date is required" }),
  security_deposit: z.coerce.number().min(0).optional(),
  rented_sqft: z.coerce.number().min(0.01, "Rented sq. ft. is required"),
  monthly_rent: z.coerce.number().min(0, "Rent must be positive"),
  rent_due_day: z.coerce.number().min(1).max(28, "Due day must be between 1-28"),
  rent_due_month_offset: z.coerce.number().min(-1).max(1),
  requires_gst: z.boolean(),
  tds_applicable: z.boolean(),
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
}).refine((data) => {
  if (!data.owner_shares || data.owner_shares.length === 0) return true;
  const total = data.owner_shares.reduce((sum, s) => sum + (Number(s.share_percentage) || 0), 0);
  return Math.abs(total - 100) < 0.01;
}, {
  message: "Owner shares must add up to 100%",
  path: ["owner_shares"],
});

type TenantFormValues = z.infer<typeof tenantSchema>;

const WIZARD_STEPS: { id: string; label: string; fields: (keyof TenantFormValues)[] }[] = [
  { id: "where", label: "Where", fields: ["assignment_type", "property_id", "unit_id", "floor_id", "floor_unit_ids", "owner_shares"] },
  { id: "who", label: "Who", fields: ["name", "email", "phone"] },
  { id: "rent", label: "Rent Terms", fields: ["monthly_rent", "rent_due_day", "rent_due_month_offset", "requires_gst", "tds_applicable"] },
  { id: "billing", label: "Billing", fields: ["bill_from_name", "bill_from_address", "bill_from_gstin", "bill_to_name", "bill_to_address", "bill_to_gstin"] },
  { id: "dates", label: "Dates & Deposit", fields: ["move_in_date", "lease_start_date", "lease_end_date", "security_deposit", "rented_sqft"] },
];

interface AddTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTenant?: Tenant | null;
  defaultPropertyId?: string;
  defaultUnitId?: string;
  /** Prefill building/location + rent structure from a vacating tenant. Personal fields stay blank. */
  prefillFromTenant?: Tenant | null;
}

const AddTenantDialog = ({
  open,
  onOpenChange,
  editTenant,
  defaultPropertyId,
  defaultUnitId,
  prefillFromTenant,
}: AddTenantDialogProps) => {
  const queryClient = useQueryClient();
  const createTenant = useCreateTenant();
  const updateTenant = useUpdateTenant();
  const { data: properties } = useProperties();
  const { data: propertiesWithUnits } = usePropertiesWithUnits();
  const { data: allTenants } = useTenants();
  const { data: billingAddresses } = useBillingAddresses();
  const createBillingAddress = useCreateBillingAddress();

  const [saveAsNewAddress, setSaveAsNewAddress] = useState(false);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const getDefaultAssignmentType = () => {
    if (editTenant?.unit_id || defaultUnitId || prefillFromTenant?.unit_id) return "unit";
    return "property";
  };

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    editTenant?.property_id || defaultPropertyId || prefillFromTenant?.property_id || null
  );
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(
    editTenant?.floor_id || prefillFromTenant?.floor_id || null
  );

  const { data: floors } = usePropertyFloors(selectedPropertyId);
  const { data: floorUnits } = useFloorUnitsByProperty(selectedPropertyId);
  const { data: ownerShares } = usePropertyOwnerShares(selectedPropertyId || undefined);
  const { ownerShares: existingTenantOwnerShares, upsertOwnerShares: upsertTenantOwnerShares } = useTenantOwnerShares(editTenant?.id);
  const { data: allPropertyOwners } = usePropertyOwners();
  const { tenantFloorUnits: existingTenantFloorUnits, upsertFloorUnits: upsertTenantFloorUnits } = useTenantFloorUnits(editTenant?.id);
  const { tenantFloorUnits: prefillTenantFloorUnits } = useTenantFloorUnits(!editTenant ? prefillFromTenant?.id : undefined);
  const { allTenantFloorUnits } = useAllTenantFloorUnits();

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
      floor_unit_ids: [],
      property_owner_id: editTenant?.property_owner_id || "",
      owner_shares: [],
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
      rent_due_month_offset: (editTenant as any)?.rent_due_month_offset ?? 0,
      requires_gst: editTenant?.requires_gst || false,
      tds_applicable: editTenant?.tds_applicable || false,
      bill_from_name: editTenant?.bill_from_name || "",
      bill_from_address: editTenant?.bill_from_address || "",
      bill_from_gstin: editTenant?.bill_from_gstin || "",
      bill_to_name: editTenant?.bill_to_name || "",
      bill_to_address: editTenant?.bill_to_address || "",
      bill_to_gstin: editTenant?.bill_to_gstin || "",
    },
  });

  const { fields: ownerShareFields, append: appendOwnerShare, remove: removeOwnerShare } = useFieldArray({
    control: form.control,
    name: "owner_shares",
  });

  // Calculate total owner percentage
  const watchedOwnerShares = form.watch("owner_shares") || [];
  const totalOwnerPercentage = watchedOwnerShares.reduce((sum, share) => sum + (Number(share.share_percentage) || 0), 0);

  const assignmentType = form.watch("assignment_type");
  const watchedPropertyId = form.watch("property_id");
  const selectedPropertyOwnerId = form.watch("property_owner_id");

  // Auto-populate billing details from selected owner & auto-set GST flag
  useEffect(() => {
    if (!selectedPropertyOwnerId || !allPropertyOwners) return;
    const owner = allPropertyOwners.find(o => o.id === selectedPropertyOwnerId);
    if (owner) {
      if (owner.gstin) {
        form.setValue("bill_from_gstin", owner.gstin);
        // Auto-enable GST if owner has GSTIN
        if (!editTenant) form.setValue("requires_gst", true);
      }
      if (owner.billing_address) form.setValue("bill_from_address", owner.billing_address);
      if (owner.name) form.setValue("bill_from_name", owner.name);
    }
  }, [selectedPropertyOwnerId, allPropertyOwners]);

  // Sync move_in_date with lease_start_date when creating new tenant
  const watchedLeaseStartDate = form.watch("lease_start_date");
  useEffect(() => {
    if (!editTenant && watchedLeaseStartDate) {
      const currentMoveIn = form.getValues("move_in_date");
      if (!currentMoveIn) {
        form.setValue("move_in_date", watchedLeaseStartDate);
      }
    }
  }, [watchedLeaseStartDate, editTenant]);

  // Pre-fill bill_to_name with tenant name
  const watchedTenantName = form.watch("name");
  useEffect(() => {
    if (!editTenant && watchedTenantName) {
      const currentBillTo = form.getValues("bill_to_name");
      if (!currentBillTo) {
        form.setValue("bill_to_name", watchedTenantName);
      }
    }
  }, [watchedTenantName, editTenant]);

  // Auto-populate from single property owner
  useEffect(() => {
    if (ownerShares?.length === 1 && !editTenant) {
      const singleOwner = ownerShares[0];
      if (singleOwner.property_owners) {
        form.setValue("property_owner_id", singleOwner.owner_id);
        if (singleOwner.property_owners.gstin) form.setValue("bill_from_gstin", singleOwner.property_owners.gstin);
        if (singleOwner.property_owners.billing_address) form.setValue("bill_from_address", singleOwner.property_owners.billing_address);
        if (singleOwner.property_owners.name) form.setValue("bill_from_name", singleOwner.property_owners.name);
      }
    }
  }, [ownerShares, editTenant]);

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
      const pf = !editTenant ? prefillFromTenant : null;
      setSelectedPropertyId(editTenant?.property_id || defaultPropertyId || pf?.property_id || null);
      setSelectedFloorId(editTenant?.floor_id || pf?.floor_id || null);
      setSaveAsNewAddress(false);
      setStep(0);

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
        property_id: editTenant?.property_id || defaultPropertyId || pf?.property_id || "",
        unit_id: editTenant?.unit_id || defaultUnitId || pf?.unit_id || "",
        floor_id: editTenant?.floor_id || pf?.floor_id || "",
        floor_unit_ids: existingTenantFloorUnits?.map(x => x.floor_unit_id)
          || prefillTenantFloorUnits?.map(x => x.floor_unit_id)
          || [],
        property_owner_id: editTenant?.property_owner_id || pf?.property_owner_id || "",
        owner_shares: existingTenantOwnerShares?.map(share => ({
          owner_id: share.owner_id,
          share_percentage: share.share_percentage,
        })) || [],
        name: editTenant?.name || "",
        email: editTenant?.email || "",
        phone: editTenant?.phone || "",
        move_in_date: editTenant?.move_in_date ? new Date(editTenant.move_in_date) : undefined,
        lease_start_date: editTenant?.lease_start_date ? new Date(editTenant.lease_start_date) : undefined,
        lease_end_date: editTenant?.lease_end_date ? new Date(editTenant.lease_end_date) : undefined,
        security_deposit: editTenant?.security_deposit || 0,
        rented_sqft: editTenant?.rented_sqft ?? pf?.rented_sqft ?? 0,
        monthly_rent: editTenant?.monthly_rent ?? pf?.monthly_rent ?? 0,
        rent_due_day: editTenant?.rent_due_day || pf?.rent_due_day || 1,
        rent_due_month_offset: (editTenant as any)?.rent_due_month_offset ?? (pf as any)?.rent_due_month_offset ?? 0,
        requires_gst: editTenant?.requires_gst ?? pf?.requires_gst ?? false,
        tds_applicable: editTenant?.tds_applicable ?? pf?.tds_applicable ?? false,
        bill_from_name: editTenant?.bill_from_name || pf?.bill_from_name || defaultBillingAddress?.name || "",
        bill_from_address: editTenant?.bill_from_address || pf?.bill_from_address || defaultBillingAddress?.address || "",
        bill_from_gstin: editTenant?.bill_from_gstin || pf?.bill_from_gstin || defaultBillingAddress?.gstin || "",
        bill_to_name: editTenant?.bill_to_name || "",
        bill_to_address: editTenant?.bill_to_address || "",
        bill_to_gstin: editTenant?.bill_to_gstin || "",
      });
    }
  }, [open, editTenant, defaultPropertyId, defaultUnitId, prefillFromTenant, form, billingAddresses, defaultBillingAddress, existingTenantOwnerShares, existingTenantFloorUnits, prefillTenantFloorUnits]);

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
      rent_due_month_offset: values.rent_due_month_offset,
      requires_gst: values.requires_gst,
      tds_applicable: values.tds_applicable,
      bill_from_name: values.bill_from_name || undefined,
      bill_from_address: values.bill_from_address || undefined,
      bill_from_gstin: values.bill_from_gstin || undefined,
      bill_to_name: values.bill_to_name || undefined,
      bill_to_address: values.bill_to_address || undefined,
      bill_to_gstin: values.bill_to_gstin || undefined,
    };

    let tenantId: string;
    if (editTenant) {
      await updateTenant.mutateAsync({ id: editTenant.id, ...payload });
      tenantId = editTenant.id;
    } else {
      const newTenant = await createTenant.mutateAsync(payload);
      tenantId = newTenant.id;
    }

    // Save tenant owner shares if any
    if (hasMultipleOwners && values.owner_shares && values.owner_shares.length > 0) {
      await upsertTenantOwnerShares.mutateAsync({
        tenantId,
        shares: values.owner_shares.map(share => ({
          owner_id: share.owner_id,
          share_percentage: share.share_percentage,
        })),
      });
    }

    // Sync corp number (floor unit) assignments — a tenant can hold multiple, a corp number can be shared
    await upsertTenantFloorUnits.mutateAsync({
      tenantId,
      floorUnitIds: values.floor_unit_ids || [],
    });

    // Persist GSTIN and billing address back to the property owner
    if (values.property_owner_id && values.bill_from_gstin) {
      try {
        const { error } = await supabase
          .from("property_owners")
          .update({
            gstin: values.bill_from_gstin,
            billing_address: values.bill_from_address || null,
          })
          .eq("id", values.property_owner_id);
        if (!error) {
          queryClient.invalidateQueries({ queryKey: ["property-owners"] });
        }
      } catch (e) {
        console.error("Failed to save owner GSTIN:", e);
      }
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

  const isLastStep = step === WIZARD_STEPS.length - 1;

  const handleNext = async () => {
    const valid = await form.trigger(WIZARD_STEPS[step].fields);
    if (valid) setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTenant ? "Edit Tenant" : "Add New Tenant"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 pb-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{WIZARD_STEPS[step].label}</span>
            <span className="text-muted-foreground">Step {step + 1} of {WIZARD_STEPS.length}</span>
          </div>
          <div className="flex gap-1.5">
            {WIZARD_STEPS.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLastStep) e.preventDefault();
            }}
            className="space-y-4"
          >
            {step === 0 && (
              <>
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

                {/* Unit / Corp No. Selection - filtered by selected floor, multiple allowed */}
                {floorUnits && floorUnits.length > 0 && (() => {
                  const watchedFloor = form.watch("floor_id");
                  const relevantUnits = watchedFloor
                    ? floorUnits.filter(u => u.floor_id === watchedFloor)
                    : floorUnits;
                  if (relevantUnits.length === 0) return null;
                  return (
                    <FormField
                      control={form.control}
                      name="floor_unit_ids"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit / Corp No. (select any that apply)</FormLabel>
                          <div className="space-y-2 rounded-lg border p-3 max-h-48 overflow-y-auto">
                            {relevantUnits.map((u) => {
                              const occupants = allTenantFloorUnits?.filter(
                                tfu => tfu.floor_unit_id === u.id &&
                                  tfu.tenants?.status === "active" &&
                                  tfu.tenant_id !== editTenant?.id
                              ) || [];
                              const floorName = floors?.find(f => f.id === u.floor_id)?.floor_name;
                              const checked = (field.value || []).includes(u.id);
                              return (
                                <div key={u.id} className="flex items-start gap-2">
                                  <Checkbox
                                    id={`floor-unit-${u.id}`}
                                    checked={checked}
                                    onCheckedChange={(isChecked) => {
                                      const current = field.value || [];
                                      field.onChange(
                                        isChecked
                                          ? [...current, u.id]
                                          : current.filter((id) => id !== u.id)
                                      );
                                      // Auto-select the corp number's floor so the list narrows to it
                                      if (isChecked && u.floor_id && form.getValues("floor_id") !== u.floor_id) {
                                        form.setValue("floor_id", u.floor_id, { shouldDirty: true, shouldValidate: true });
                                      }
                                    }}
                                  />
                                  <Label htmlFor={`floor-unit-${u.id}`} className="text-sm font-normal cursor-pointer flex-1">
                                    {u.corp_number}
                                    <span className="text-muted-foreground ml-2 text-xs">
                                      {floorName ? `(F: ${floorName}, ` : "("}
                                      {Number(u.area_sqft).toLocaleString()} sq.ft){" "}
                                      {occupants.length > 0
                                        ? `— Occupied by ${occupants.map(o => o.tenants?.name).join(", ")}`
                                        : "— Vacant"}
                                    </span>
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  );
                })()}

                {/* Multi-Owner Assignment - only show if property has multiple owners */}
                {hasMultipleOwners && (
                  <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Users className="w-4 h-4" />
                        Owner Shares
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendOwnerShare({ owner_id: "", share_percentage: 0 })}
                        disabled={ownerShareFields.length >= (ownerShares?.length || 0)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Owner
                      </Button>
                    </div>

                    {ownerShareFields.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No owners assigned. Click "Add Owner" to assign this tenant to specific owners with their share percentages.
                      </p>
                    )}

                    {ownerShareFields.map((field, index) => (
                      <div key={field.id} className="flex items-end gap-2">
                        <FormField
                          control={form.control}
                          name={`owner_shares.${index}.owner_id`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              {index === 0 && <FormLabel>Owner</FormLabel>}
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select owner" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {ownerShares
                                    ?.filter((share) => share.owner_id && share.owner_id.trim() !== "")
                                    .map((share) => (
                                      <SelectItem key={share.owner_id} value={share.owner_id}>
                                        {share.property_owners?.name} (Property: {share.share_percentage}%)
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`owner_shares.${index}.share_percentage`}
                          render={({ field }) => (
                            <FormItem className="w-28">
                              {index === 0 && <FormLabel>Share %</FormLabel>}
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    min="0.01"
                                    max="100"
                                    step="0.01"
                                    {...field}
                                    className="pr-8"
                                  />
                                  <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove owner"
                          onClick={() => removeOwnerShare(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}

                    {ownerShareFields.length > 0 && (
                      <div className={cn(
                        "text-sm font-medium flex items-center gap-2 pt-2 border-t",
                        totalOwnerPercentage === 100 ? "text-success" :
                        totalOwnerPercentage > 100 ? "text-destructive" : "text-warning"
                      )}>
                        <span>Total: {totalOwnerPercentage.toFixed(2)}%</span>
                        {totalOwnerPercentage !== 100 && (
                          <span className="text-muted-foreground font-normal">
                            (Must equal 100%)
                          </span>
                        )}
                      </div>
                    )}
                    {form.formState.errors.owner_shares?.message && (
                      <p className="text-sm font-medium text-destructive">
                        {form.formState.errors.owner_shares.message}
                      </p>
                    )}
                  </div>
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
              </>
            )}

            {step === 1 && (
              <>
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
              </>
            )}

            {step === 2 && (
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
                  name="rent_due_month_offset"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Month</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(parseInt(v))}
                        value={String(field.value ?? 0)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select due month" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="-1">In advance — previous month (e.g. April rent due in March)</SelectItem>
                          <SelectItem value="0">Same month (e.g. April rent due in April)</SelectItem>
                          <SelectItem value="1">In arrears — following month (e.g. April rent due in May)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Controls which calendar month the due date falls in relative to the rent period.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                <FormField
                  control={form.control}
                  name="tds_applicable"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>TDS Applicable</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Default for this tenant when recording rent payments; 10% is deducted from rent due
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
            )}

            {step === 3 && (
              <div className="space-y-4">
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
            )}

            {step === 4 && (
              <>
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
                              min={0.01}
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
              </>
            )}

            <div className="flex justify-between items-center gap-3 pt-4 border-t">
              <div>
                {step > 0 && (
                  <Button type="button" variant="outline" onClick={handleBack}>
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                {isLastStep ? (
                  <Button
                    type="submit"
                    variant="hero"
                    disabled={createTenant.isPending || updateTenant.isPending}
                  >
                    {editTenant ? "Update Tenant" : "Add Tenant"}
                  </Button>
                ) : (
                  <Button type="button" variant="hero" onClick={handleNext}>
                    Next
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddTenantDialog;
