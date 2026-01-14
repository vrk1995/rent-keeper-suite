import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Layers, UserPlus } from "lucide-react";
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

const floorSchema = z.object({
  floor_name: z.string().min(1, "Floor name required"),
  floor_sqft: z.coerce.number().min(0, "Must be positive"),
});

const propertySchema = z.object({
  name: z.string().min(1, "Property name is required").max(100),
  address: z.string().min(1, "Address is required").max(255),
  property_type: z.string().min(1, "Property type is required"),
  property_owner_id: z.string().optional(),
  new_owner_name: z.string().optional(),
  floors_owned: z.coerce.number().min(1, "Must own at least 1 floor"),
  notes: z.string().max(500).optional(),
  floors: z.array(floorSchema),
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
  const { data: existingFloors } = usePropertyFloors(editProperty?.id || "");
  const { data: propertyOwners } = usePropertyOwners();
  const createPropertyOwner = useCreatePropertyOwner();
  const [showNewOwnerInput, setShowNewOwnerInput] = useState(false);
  
  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: "",
      address: "",
      property_type: "apartment",
      property_owner_id: "",
      new_owner_name: "",
      floors_owned: 1,
      notes: "",
      floors: [{ floor_name: "G", floor_sqft: 0 }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "floors",
  });

  const floorsOwned = form.watch("floors_owned");

  // Auto-generate floor entries when floors_owned changes
  useEffect(() => {
    const currentFloors = form.getValues("floors");
    const numFloors = floorsOwned || 1;
    
    if (currentFloors.length !== numFloors) {
      const newFloors = [];
      for (let i = 0; i < numFloors; i++) {
        const existingFloor = currentFloors[i];
        if (existingFloor) {
          newFloors.push(existingFloor);
        } else {
          // Generate floor name: G for ground, then 1, 2, 3...
          const floorName = i === 0 ? "G" : String(i);
          newFloors.push({ floor_name: floorName, floor_sqft: 0 });
        }
      }
      replace(newFloors);
    }
  }, [floorsOwned, form, replace]);

  // Reset form when dialog opens/closes or edit property changes
  useEffect(() => {
    if (open) {
      setShowNewOwnerInput(false);
      if (editProperty) {
        const floors = existingFloors?.map(f => ({
          floor_name: f.floor_name,
          floor_sqft: f.floor_sqft,
        })) || [];
        
        // If no floors exist, generate based on floors_owned
        const floorEntries = floors.length > 0 ? floors : 
          Array.from({ length: editProperty.floors_owned || 1 }, (_, i) => ({
            floor_name: i === 0 ? "G" : String(i),
            floor_sqft: 0,
          }));

        form.reset({
          name: editProperty.name,
          address: editProperty.address,
          property_type: editProperty.property_type,
          property_owner_id: editProperty.property_owner_id || "",
          new_owner_name: "",
          floors_owned: editProperty.floors_owned || 1,
          notes: editProperty.notes || "",
          floors: floorEntries,
        });
      } else {
        form.reset({
          name: "",
          address: "",
          property_type: "apartment",
          property_owner_id: "",
          new_owner_name: "",
          floors_owned: 1,
          notes: "",
          floors: [{ floor_name: "G", floor_sqft: 0 }],
        });
      }
    }
  }, [open, editProperty, existingFloors, form]);

  const onSubmit = async (values: PropertyFormValues) => {
    // Calculate total sqft from floors
    const totalSqft = values.floors.reduce((sum, f) => sum + (f.floor_sqft || 0), 0);
    
    // Handle new owner creation
    let ownerId = values.property_owner_id || undefined;
    if (showNewOwnerInput && values.new_owner_name?.trim()) {
      const newOwner = await createPropertyOwner.mutateAsync({ name: values.new_owner_name.trim() });
      ownerId = newOwner.id;
    }

    if (editProperty) {
      await updateProperty.mutateAsync({ 
        id: editProperty.id, 
        name: values.name,
        address: values.address,
        property_type: values.property_type,
        property_owner_id: ownerId || null,
        floors_owned: values.floors_owned,
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
    } else {
      const newProperty = await createProperty.mutateAsync({
        name: values.name,
        address: values.address,
        property_type: values.property_type,
        property_owner_id: ownerId,
        floors_owned: values.floors_owned,
        total_sqft: totalSqft,
        notes: values.notes,
      });
      
      // Create floors for new property
      if (newProperty?.id) {
        await bulkUpsertFloors.mutateAsync({
          property_id: newProperty.id,
          floors: values.floors.map(f => ({
            floor_name: f.floor_name,
            floor_sqft: f.floor_sqft,
          })),
        });
      }
    }
    form.reset();
    setShowNewOwnerInput(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
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
            
            {/* Owned By Section */}
            <div className="space-y-3">
              <FormLabel>Owned By</FormLabel>
              {!showNewOwnerInput ? (
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="property_owner_id"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select owner (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">No specific owner</SelectItem>
                            {propertyOwners?.map((owner) => (
                              <SelectItem key={owner.id} value={owner.id}>
                                {owner.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNewOwnerInput(true)}
                    title="Add new owner"
                  >
                    <UserPlus className="h-4 w-4" />
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

            <FormField
              control={form.control}
              name="floors_owned"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Floors Owned</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={50} placeholder="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Floor Details Section */}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium">Floor Details</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter the floor name (G for Ground, 1, 2, B1 for basement, etc.) and square footage for each floor.
              </p>
              
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start">
                    <FormField
                      control={form.control}
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
                      control={form.control}
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
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={index === 0 ? "mt-6" : ""}
                        onClick={() => {
                          remove(index);
                          form.setValue("floors_owned", fields.length - 1);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  append({ floor_name: String(fields.length), floor_sqft: 0 });
                  form.setValue("floors_owned", fields.length + 1);
                }}
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="hero"
                disabled={createProperty.isPending || updateProperty.isPending || bulkUpsertFloors.isPending}
              >
                {editProperty ? "Update Property" : "Add Property"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddPropertyDialog;
