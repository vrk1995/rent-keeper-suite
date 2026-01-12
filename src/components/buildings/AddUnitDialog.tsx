import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCreateUnit, useUpdateUnit, Unit } from "@/hooks/useBuildings";

const unitSchema = z.object({
  name: z.string().min(1, "Unit name is required").max(100),
  floor_number: z.coerce.number().min(0).optional(),
  unit_type: z.string().min(1, "Unit type is required"),
  monthly_rent: z.coerce.number().min(0, "Rent must be positive"),
  total_sqft: z.coerce.number().min(0).optional(),
  status: z.string().default("vacant"),
  notes: z.string().max(1000).optional(),
});

type UnitFormValues = z.infer<typeof unitSchema>;

interface AddUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string | null;
  editUnit?: Unit | null;
}

const unitTypes = [
  { value: "full_floor", label: "Full Floor" },
  { value: "partial_floor", label: "Partial Floor" },
  { value: "room", label: "Room" },
  { value: "shop", label: "Shop" },
  { value: "commercial", label: "Commercial Space" },
];

const unitStatuses = [
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "maintenance", label: "Under Maintenance" },
];

export const AddUnitDialog = ({
  open,
  onOpenChange,
  buildingId,
  editUnit,
}: AddUnitDialogProps) => {
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();

  const form = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      name: "",
      floor_number: undefined,
      unit_type: "room",
      monthly_rent: 0,
      total_sqft: 0,
      status: "vacant",
      notes: "",
    },
  });

  useEffect(() => {
    if (editUnit) {
      form.reset({
        name: editUnit.name,
        floor_number: editUnit.floor_number ?? undefined,
        unit_type: editUnit.unit_type,
        monthly_rent: editUnit.monthly_rent,
        total_sqft: editUnit.total_sqft || 0,
        status: editUnit.status,
        notes: editUnit.notes || "",
      });
    } else {
      form.reset({
        name: "",
        floor_number: undefined,
        unit_type: "room",
        monthly_rent: 0,
        total_sqft: 0,
        status: "vacant",
        notes: "",
      });
    }
  }, [editUnit, form]);

  const onSubmit = async (values: UnitFormValues) => {
    try {
      if (editUnit) {
        await updateUnit.mutateAsync({
          id: editUnit.id,
          ...values,
        });
      } else if (buildingId) {
        await createUnit.mutateAsync({
          building_id: buildingId,
          name: values.name,
          unit_type: values.unit_type,
          monthly_rent: values.monthly_rent,
          total_sqft: values.total_sqft,
          floor_number: values.floor_number,
          status: values.status,
          notes: values.notes,
        });
      }
      onOpenChange(false);
      form.reset();
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editUnit ? "Edit Unit" : "Add Unit"}</DialogTitle>
          <DialogDescription>
            {editUnit
              ? "Update the unit details below."
              : "Add a new unit to this building."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Unit 101, Shop A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="unit_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {unitTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
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
                name="floor_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor Number</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g., 1"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="monthly_rent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly Rent (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="total_sqft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Sq. Ft.</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} placeholder="2000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {unitStatuses.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createUnit.isPending || updateUnit.isPending}
              >
                {createUnit.isPending || updateUnit.isPending
                  ? "Saving..."
                  : editUnit
                  ? "Update Unit"
                  : "Add Unit"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
