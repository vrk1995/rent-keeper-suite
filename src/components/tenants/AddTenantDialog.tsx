import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
import { useCreateTenant, useUpdateTenant, Tenant } from "@/hooks/useTenants";
import { useProperties } from "@/hooks/useProperties";
import { usePropertiesWithUnits } from "@/hooks/useUnits";
import { cn } from "@/lib/utils";

const tenantSchema = z.object({
  assignment_type: z.enum(["property", "unit"]),
  property_id: z.string().optional(),
  unit_id: z.string().optional(),
  name: z.string().min(1, "Tenant name is required").max(100),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(15).optional(),
  move_in_date: z.date({ required_error: "Move-in date is required" }),
  lease_start_date: z.date({ required_error: "Lease start date is required" }),
  lease_end_date: z.date({ required_error: "Lease end date is required" }),
  security_deposit: z.coerce.number().min(0).optional(),
  rented_sqft: z.coerce.number().min(0).optional(),
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
  
  const getDefaultAssignmentType = () => {
    if (editTenant?.unit_id || defaultUnitId) return "unit";
    return "property";
  };
  
  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      assignment_type: getDefaultAssignmentType(),
      property_id: editTenant?.property_id || defaultPropertyId || "",
      unit_id: editTenant?.unit_id || defaultUnitId || "",
      name: editTenant?.name || "",
      email: editTenant?.email || "",
      phone: editTenant?.phone || "",
      move_in_date: editTenant?.move_in_date ? new Date(editTenant.move_in_date) : undefined,
      lease_start_date: editTenant?.lease_start_date ? new Date(editTenant.lease_start_date) : undefined,
      lease_end_date: editTenant?.lease_end_date ? new Date(editTenant.lease_end_date) : undefined,
      security_deposit: editTenant?.security_deposit || 0,
      rented_sqft: editTenant?.rented_sqft || 0,
    },
  });

  const assignmentType = form.watch("assignment_type");

  useEffect(() => {
    if (open) {
      form.reset({
        assignment_type: getDefaultAssignmentType(),
        property_id: editTenant?.property_id || defaultPropertyId || "",
        unit_id: editTenant?.unit_id || defaultUnitId || "",
        name: editTenant?.name || "",
        email: editTenant?.email || "",
        phone: editTenant?.phone || "",
        move_in_date: editTenant?.move_in_date ? new Date(editTenant.move_in_date) : undefined,
        lease_start_date: editTenant?.lease_start_date ? new Date(editTenant.lease_start_date) : undefined,
        lease_end_date: editTenant?.lease_end_date ? new Date(editTenant.lease_end_date) : undefined,
        security_deposit: editTenant?.security_deposit || 0,
        rented_sqft: editTenant?.rented_sqft || 0,
      });
    }
  }, [open, editTenant, defaultPropertyId, defaultUnitId, form]);

  const onSubmit = async (values: TenantFormValues) => {
    const payload = {
      property_id: values.assignment_type === "property" ? values.property_id! : properties?.[0]?.id || "",
      unit_id: values.assignment_type === "unit" ? values.unit_id : undefined,
      name: values.name,
      email: values.email || undefined,
      phone: values.phone,
      move_in_date: format(values.move_in_date, "yyyy-MM-dd"),
      lease_start_date: format(values.lease_start_date, "yyyy-MM-dd"),
      lease_end_date: format(values.lease_end_date, "yyyy-MM-dd"),
      security_deposit: values.security_deposit,
      rented_sqft: values.rented_sqft,
    };

    if (editTenant) {
      await updateTenant.mutateAsync({ id: editTenant.id, ...payload });
    } else {
      await createTenant.mutateAsync(payload);
    }
    form.reset();
    onOpenChange(false);
  };

  // Flatten units for easy selection
  const allUnits = propertiesWithUnits?.flatMap(property => 
    property.units?.map((unit: any) => ({
      ...unit,
      displayName: `${property.name} - ${unit.name}`,
    })) || []
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rented Sq. Ft.</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} placeholder="1500" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
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
