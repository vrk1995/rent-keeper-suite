import { useEffect, useState } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Layers, UserPlus, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useCreateProperty, useUpdateProperty, Property } from "@/hooks/useProperties";
import { usePropertyFloors, useBulkUpsertFloors } from "@/hooks/usePropertyFloors";
import { usePropertyOwners, useCreatePropertyOwner } from "@/hooks/usePropertyOwners";
import { usePropertyOwnerShares, useBulkUpsertOwnerShares } from "@/hooks/usePropertyOwnerShares";
import { useFloorUnitsByProperty, useCreateFloorUnit, useUpdateFloorUnit, useDeleteFloorUnit } from "@/hooks/useFloorUnits";
import { supabase } from "@/integrations/supabase/client";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesAlert } from "@/components/ui/unsaved-changes-alert";

const floorUnitSchema = z.object({
  id: z.string().optional(),
  corp_number: z.string().min(1, "Corp no. required"),
  area_sqft: z.coerce.number().min(0, "Must be positive"),
});

const floorSchema = z.object({
  floor_name: z.string().min(1, "Floor name required"),
  floor_sqft: z.coerce.number().min(0, "Must be positive"),
  units: z.array(floorUnitSchema).optional().default([]),
});

const ownerShareSchema = z.object({
  owner_id: z.string().min(1, "Owner is required"),
  share_percentage: z.coerce.number().min(0.01, "Must be > 0").max(100, "Max 100%"),
});

const propertySchema = z.object({
  name: z.string().min(1, "Property name is required").max(100),
  address: z.string().min(1, "Address is required").max(255),
  property_type: z.string().min(1, "Property type is required"),
  new_owner_name: z.string().optional(),
  notes: z.string().max(500).optional(),
  floors: z.array(floorSchema).min(1, "At least one floor is required"),
  owner_shares: z.array(ownerShareSchema),
}).refine((data) => {
  if (data.owner_shares.length === 0) return true;
  const total = data.owner_shares.reduce((sum, s) => sum + (Number(s.share_percentage) || 0), 0);
  return Math.abs(total - 100) < 0.01;
}, {
  message: "Owner shares must add up to 100%",
  path: ["owner_shares"],
});

type PropertyFormValues = z.infer<typeof propertySchema>;

interface AddPropertyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editProperty?: Property | null;
}

const AddPropertyDialog = ({ open, onOpenChange, editProperty }: AddPropertyDialogProps) => {
  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  const bulkUpsertFloors = useBulkUpsertFloors();
  const bulkUpsertOwnerShares = useBulkUpsertOwnerShares();
  const { data: existingFloors } = usePropertyFloors(editProperty?.id || "");
  const { data: existingShares } = usePropertyOwnerShares(editProperty?.id);
  const { data: existingFloorUnits } = useFloorUnitsByProperty(editProperty?.id);
  const { data: propertyOwners } = usePropertyOwners();
  const createPropertyOwner = useCreatePropertyOwner();
  const createFloorUnit = useCreateFloorUnit();
  const updateFloorUnit = useUpdateFloorUnit();
  const deleteFloorUnit = useDeleteFloorUnit();
  const [showNewOwnerInput, setShowNewOwnerInput] = useState(false);
  const [removeFloorIndex, setRemoveFloorIndex] = useState<number | null>(null);

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: "",
      address: "",
      property_type: "apartment",
      new_owner_name: "",
      notes: "",
      floors: [{ floor_name: "G", floor_sqft: 0, units: [] }],
      owner_shares: [],
    },
  });

  const { fields: floorFields, append: appendFloor, remove: removeFloor } = useFieldArray({
    control: form.control,
    name: "floors",
  });

  const { fields: ownerFields, append: appendOwner, remove: removeOwner, replace: replaceOwners } = useFieldArray({
    control: form.control,
    name: "owner_shares",
  });

  const ownerShares = form.watch("owner_shares");

  // Calculate total percentage
  const totalPercentage = ownerShares.reduce((sum, s) => sum + (Number(s.share_percentage) || 0), 0);

  // Reset form when dialog opens/closes or edit property changes
  useEffect(() => {
    if (open) {
      setShowNewOwnerInput(false);
      if (editProperty) {
        const floors = existingFloors?.map(f => ({
          floor_name: f.floor_name,
          floor_sqft: f.floor_sqft,
          units: (existingFloorUnits || [])
            .filter(u => u.floor_id === f.id)
            .map(u => ({ id: u.id, corp_number: u.corp_number, area_sqft: Number(u.area_sqft) })),
        })) || [];
        
        const floorEntries = floors.length > 0 ? floors : 
          Array.from({ length: editProperty.floors_owned || 1 }, (_, i) => ({
            floor_name: i === 0 ? "G" : String(i),
            floor_sqft: 0,
            units: [] as { id?: string; corp_number: string; area_sqft: number }[],
          }));

        const shares = existingShares?.map(s => ({
          owner_id: s.owner_id,
          share_percentage: s.share_percentage,
        })) || [];

        form.reset({
          name: editProperty.name,
          address: editProperty.address,
          property_type: editProperty.property_type,
          new_owner_name: "",
          notes: editProperty.notes || "",
          floors: floorEntries,
          owner_shares: shares,
        });
      } else {
        form.reset({
          name: "",
          address: "",
          property_type: "apartment",
          new_owner_name: "",
          notes: "",
          floors: [{ floor_name: "G", floor_sqft: 0, units: [] }],
          owner_shares: [],
        });
      }
    }
  }, [open, editProperty, existingFloors, existingShares, existingFloorUnits, form]);

  // Sync corp-no. rows for a property with the DB
  const syncFloorUnits = async (
    propertyId: string,
    floors: PropertyFormValues["floors"]
  ) => {
    // Load current floors so we can map floor_name -> floor_id
    const { data: dbFloors } = await supabase
      .from("property_floors")
      .select("id, floor_name")
      .eq("property_id", propertyId);
    const floorIdByName = new Map((dbFloors || []).map((f: any) => [f.floor_name, f.id]));

    // Load existing units for diffing
    const { data: dbUnits } = await supabase
      .from("floor_units")
      .select("id, floor_id, corp_number, area_sqft")
      .eq("property_id", propertyId);
    const dbUnitsById = new Map((dbUnits || []).map((u: any) => [u.id, u]));
    const keptIds = new Set<string>();

    for (const f of floors) {
      const floorId = floorIdByName.get(f.floor_name);
      if (!floorId) continue;
      for (const u of f.units || []) {
        if (u.id && dbUnitsById.has(u.id)) {
          keptIds.add(u.id);
          const prev = dbUnitsById.get(u.id) as any;
          if (
            prev.corp_number !== u.corp_number ||
            Number(prev.area_sqft) !== Number(u.area_sqft) ||
            prev.floor_id !== floorId
          ) {
            await updateFloorUnit.mutateAsync({
              id: u.id,
              property_id: propertyId,
              floor_id: floorId,
              corp_number: u.corp_number,
              area_sqft: u.area_sqft,
            });
          }
        } else {
          await createFloorUnit.mutateAsync({
            property_id: propertyId,
            floor_id: floorId,
            corp_number: u.corp_number,
            area_sqft: u.area_sqft,
          });
        }
      }
    }
    // Delete units that were removed in the form
    for (const [id, u] of dbUnitsById) {
      if (!keptIds.has(id)) {
        await deleteFloorUnit.mutateAsync({ id, property_id: propertyId });
      }
    }
  };

  const onSubmit = async (values: PropertyFormValues) => {
    // Calculate total sqft from floors
    const totalSqft = values.floors.reduce((sum, f) => sum + (f.floor_sqft || 0), 0);
    const floorsOwned = values.floors.length;

    // Handle new owner creation if needed
    let newOwnerId: string | undefined;
    if (showNewOwnerInput && values.new_owner_name?.trim()) {
      const newOwner = await createPropertyOwner.mutateAsync({ name: values.new_owner_name.trim() });
      newOwnerId = newOwner.id;
    }

    // Get primary owner for backwards compatibility (first owner or the one with highest share)
    const sortedShares = [...values.owner_shares].sort((a, b) => b.share_percentage - a.share_percentage);
    const primaryOwnerId = sortedShares[0]?.owner_id || null;

    if (editProperty) {
      await updateProperty.mutateAsync({ 
        id: editProperty.id, 
        name: values.name,
        address: values.address,
        property_type: values.property_type,
        property_owner_id: primaryOwnerId,
        floors_owned: floorsOwned,
        total_sqft: totalSqft,
        notes: values.notes,
      });
      
      // Update floors
      await bulkUpsertFloors.mutateAsync({
        property_id: editProperty.id,
        floors: values.floors.map(f => ({
          floor_name: f.floor_name,
          floor_sqft: f.floor_sqft,
        })),
      });

      // Sync floor units (corp numbers)
      await syncFloorUnits(editProperty.id, values.floors);

      // Update owner shares
      await bulkUpsertOwnerShares.mutateAsync({
        property_id: editProperty.id,
        shares: values.owner_shares.map(s => ({
          owner_id: s.owner_id,
          share_percentage: s.share_percentage,
        })),
      });
    } else {
      const newProperty = await createProperty.mutateAsync({
        name: values.name,
        address: values.address,
        property_type: values.property_type,
        property_owner_id: primaryOwnerId,
        floors_owned: floorsOwned,
        total_sqft: totalSqft,
        notes: values.notes,
      });
      
      if (newProperty?.id) {
        // Create floors for new property
        await bulkUpsertFloors.mutateAsync({
          property_id: newProperty.id,
          floors: values.floors.map(f => ({
            floor_name: f.floor_name,
            floor_sqft: f.floor_sqft,
          })),
        });

        // Sync floor units (corp numbers)
        await syncFloorUnits(newProperty.id, values.floors);

        // Create owner shares for new property
        if (values.owner_shares.length > 0) {
          await bulkUpsertOwnerShares.mutateAsync({
            property_id: newProperty.id,
            shares: values.owner_shares.map(s => ({
              owner_id: s.owner_id,
              share_percentage: s.share_percentage,
            })),
          });
        }
      }
    }
    form.reset();
    setShowNewOwnerInput(false);
    onOpenChange(false);
  };

  // Get available owners (exclude already selected ones)
  const getAvailableOwners = (currentIndex: number) => {
    const selectedOwnerIds = ownerShares
      .filter((_, idx) => idx !== currentIndex)
      .map(s => s.owner_id);
    return propertyOwners?.filter(o => !selectedOwnerIds.includes(o.id)) || [];
  };

  const { guardedOnOpenChange, pendingClose, confirmDiscard, cancelDiscard } =
    useUnsavedChangesGuard(form.formState.isDirty, onOpenChange);

  return (
    <>
    <Dialog open={open} onOpenChange={guardedOnOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editProperty ? "Edit Property" : "Add New Property"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Sunset Apartments #101" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Full address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="property_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="apartment">Apartment</SelectItem>
                      <SelectItem value="house">House</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                      <SelectItem value="floor">Floor (in building)</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Owners Section */}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium">Property Owners</h4>
                </div>
                {totalPercentage > 0 && (
                  <span className={`text-sm font-medium ${totalPercentage === 100 ? 'text-success' : totalPercentage > 100 ? 'text-destructive' : 'text-warning'}`}>
                    Total: {totalPercentage.toFixed(2)}%
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Add owners and specify their ownership share percentage. Total should equal 100%.
              </p>
              {form.formState.errors.owner_shares?.message && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.owner_shares.message}
                </p>
              )}

              {ownerFields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <FormField
                    control={form.control}
                    name={`owner_shares.${index}.owner_id`}
                    render={({ field }) => (
                      <FormItem className="flex-[2]">
                        {index === 0 && <FormLabel className="text-xs">Owner</FormLabel>}
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select owner" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {getAvailableOwners(index).map((owner) => (
                              <SelectItem key={owner.id} value={owner.id}>
                                {owner.name}
                              </SelectItem>
                            ))}
                            {/* Keep currently selected owner in the list */}
                            {field.value && !getAvailableOwners(index).find(o => o.id === field.value) && (
                              <SelectItem value={field.value}>
                                {propertyOwners?.find(o => o.id === field.value)?.name || field.value}
                              </SelectItem>
                            )}
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
                      <FormItem className="flex-1">
                        {index === 0 && <FormLabel className="text-xs">Share %</FormLabel>}
                        <FormControl>
                          <Input 
                            type="number" 
                            min={0.01} 
                            max={100} 
                            step={0.01}
                            placeholder="50" 
                            {...field} 
                          />
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
                    className={index === 0 ? "mt-6" : ""}
                    onClick={() => removeOwner(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}

              {!showNewOwnerInput ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendOwner({ owner_id: "", share_percentage: 0 })}
                    disabled={!propertyOwners?.length || ownerFields.length >= (propertyOwners?.length || 0)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Owner
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewOwnerInput(true)}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    New Owner
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="new_owner_name"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input placeholder="Enter new owner name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      const newName = form.getValues("new_owner_name")?.trim();
                      if (newName) {
                        const newOwner = await createPropertyOwner.mutateAsync({ name: newName });
                        appendOwner({ owner_id: newOwner.id, share_percentage: 0 });
                      }
                      setShowNewOwnerInput(false);
                      form.setValue("new_owner_name", "");
                    }}
                    disabled={!form.watch("new_owner_name")?.trim() || createPropertyOwner.isPending}
                  >
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowNewOwnerInput(false);
                      form.setValue("new_owner_name", "");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* Floor Details Section */}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium">Floor Details</h4>
                </div>
                <span className="text-sm text-muted-foreground">
                  {floorFields.length} floor{floorFields.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter the floor name (G for Ground, 1, 2, B1 for basement, etc.) and square footage for each floor.
              </p>
              {form.formState.errors.floors?.message && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.floors.message}
                </p>
              )}

              <div className="space-y-4">
                {floorFields.map((field, index) => (
                  <FloorRow
                    key={field.id}
                    index={index}
                    control={form.control}
                    canRemove={floorFields.length > 1}
                    onRemove={() => setRemoveFloorIndex(index)}
                    getUnits={() => (form.getValues(`floors.${index}.units`) || []) as { id?: string; corp_number: string; area_sqft: number }[]}
                    setUnits={(units) => form.setValue(`floors.${index}.units`, units, { shouldDirty: true })}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendFloor({ floor_name: String(floorFields.length), floor_sqft: 0, units: [] })}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Floor
              </Button>
            </div>

            
            <Separator />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any additional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => guardedOnOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="hero"
                disabled={createProperty.isPending || updateProperty.isPending || bulkUpsertFloors.isPending || bulkUpsertOwnerShares.isPending}
              >
                {editProperty ? "Update Property" : "Add Property"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={removeFloorIndex !== null} onOpenChange={(o) => !o && setRemoveFloorIndex(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Floor</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this floor? Its corp numbers and square footage will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setRemoveFloorIndex(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (removeFloorIndex !== null) removeFloor(removeFloorIndex);
              setRemoveFloorIndex(null);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <UnsavedChangesAlert open={pendingClose} onConfirm={confirmDiscard} onCancel={cancelDiscard} />
    </>
  );
};

// Single floor row with corp-no. sub-list
interface FloorRowProps {
  index: number;
  control: any;
  canRemove: boolean;
  onRemove: () => void;
  getUnits: () => { id?: string; corp_number: string; area_sqft: number }[];
  setUnits: (units: { id?: string; corp_number: string; area_sqft: number }[]) => void;
}

const FloorRow = ({ index, control, canRemove, onRemove, getUnits, setUnits }: FloorRowProps) => {
  const [expanded, setExpanded] = useState(true);
  const watched = useWatch({ control, name: `floors.${index}.units` }) as { id?: string; corp_number: string; area_sqft: number }[] | undefined;
  const units = watched ?? getUnits();

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
      <div className="flex gap-2 items-start">
        <FormField
          control={control}
          name={`floors.${index}.floor_name`}
          render={({ field }) => (
            <FormItem className="flex-1">
              {index === 0 && <FormLabel className="text-xs">Floor</FormLabel>}
              <FormControl>
                <Input placeholder="G, 1, 2, B1..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`floors.${index}.floor_sqft`}
          render={({ field }) => (
            <FormItem className="flex-[2]">
              {index === 0 && <FormLabel className="text-xs">Sq. Ft.</FormLabel>}
              <FormControl>
                <Input type="number" min={0} placeholder="2000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove floor"
            className={index === 0 ? "mt-6" : ""}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "▾" : "▸"} Unit / Corp Nos. ({units.length})
          </button>
          {expanded && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setUnits([...units, { corp_number: "", area_sqft: 0 }])}
            >
              <Plus className="h-3 w-3 mr-1" /> Add Corp No.
            </Button>
          )}
        </div>
        {expanded && units.length > 0 && (
          <div className="space-y-2">
            {units.map((u, uIdx) => (
              <div key={uIdx} className="flex gap-2 items-center">
                <Input
                  placeholder="Corp / Building No."
                  value={u.corp_number}
                  onChange={(e) => {
                    const next = [...units];
                    next[uIdx] = { ...next[uIdx], corp_number: e.target.value };
                    setUnits(next);
                  }}
                  className="flex-[2]"
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Sq. Ft."
                  value={u.area_sqft}
                  onChange={(e) => {
                    const next = [...units];
                    next[uIdx] = { ...next[uIdx], area_sqft: Number(e.target.value) };
                    setUnits(next);
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove corp number"
                  onClick={() => setUnits(units.filter((_, i) => i !== uIdx))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AddPropertyDialog;

