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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCreateBuilding, useUpdateBuilding, Building } from "@/hooks/useBuildings";

const buildingSchema = z.object({
  name: z.string().min(1, "Building name is required").max(100),
  address: z.string().min(1, "Address is required").max(500),
  total_floors: z.coerce.number().min(1, "Must have at least 1 floor").max(200),
  notes: z.string().max(1000).optional(),
});

type BuildingFormValues = z.infer<typeof buildingSchema>;

interface AddBuildingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBuilding?: Building | null;
}

export const AddBuildingDialog = ({
  open,
  onOpenChange,
  editBuilding,
}: AddBuildingDialogProps) => {
  const createBuilding = useCreateBuilding();
  const updateBuilding = useUpdateBuilding();

  const form = useForm<BuildingFormValues>({
    resolver: zodResolver(buildingSchema),
    defaultValues: {
      name: "",
      address: "",
      total_floors: 1,
      notes: "",
    },
  });

  useEffect(() => {
    if (editBuilding) {
      form.reset({
        name: editBuilding.name,
        address: editBuilding.address,
        total_floors: editBuilding.total_floors,
        notes: editBuilding.notes || "",
      });
    } else {
      form.reset({
        name: "",
        address: "",
        total_floors: 1,
        notes: "",
      });
    }
  }, [editBuilding, form]);

  const onSubmit = async (values: BuildingFormValues) => {
    try {
      if (editBuilding) {
        await updateBuilding.mutateAsync({
          id: editBuilding.id,
          ...values,
        });
      } else {
        await createBuilding.mutateAsync({
          name: values.name,
          address: values.address,
          total_floors: values.total_floors,
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
          <DialogTitle>{editBuilding ? "Edit Building" : "Add Building"}</DialogTitle>
          <DialogDescription>
            {editBuilding
              ? "Update the building details below."
              : "Add a new multi-unit building to your portfolio."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Building Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Sunrise Apartments" {...field} />
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
              name="total_floors"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Floors</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes about this building..."
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
                disabled={createBuilding.isPending || updateBuilding.isPending}
              >
                {createBuilding.isPending || updateBuilding.isPending
                  ? "Saving..."
                  : editBuilding
                  ? "Update Building"
                  : "Add Building"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
