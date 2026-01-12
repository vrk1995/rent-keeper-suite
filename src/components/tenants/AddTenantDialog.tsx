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
import { useCreateTenant, useUpdateTenant, Tenant } from "@/hooks/useTenants";
import { useProperties } from "@/hooks/useProperties";
import { cn } from "@/lib/utils";

const tenantSchema = z.object({
  property_id: z.string().min(1, "Property is required"),
  name: z.string().min(1, "Tenant name is required").max(100),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(15).optional(),
  move_in_date: z.date({ required_error: "Move-in date is required" }),
  lease_start_date: z.date({ required_error: "Lease start date is required" }),
  lease_end_date: z.date({ required_error: "Lease end date is required" }),
  security_deposit: z.coerce.number().min(0).optional(),
});

type TenantFormValues = z.infer<typeof tenantSchema>;

interface AddTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTenant?: Tenant | null;
  defaultPropertyId?: string;
}

const AddTenantDialog = ({ open, onOpenChange, editTenant, defaultPropertyId }: AddTenantDialogProps) => {
  const createTenant = useCreateTenant();
  const updateTenant = useUpdateTenant();
  const { data: properties } = useProperties();
  
  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      property_id: editTenant?.property_id || defaultPropertyId || "",
      name: editTenant?.name || "",
      email: editTenant?.email || "",
      phone: editTenant?.phone || "",
      move_in_date: editTenant?.move_in_date ? new Date(editTenant.move_in_date) : undefined,
      lease_start_date: editTenant?.lease_start_date ? new Date(editTenant.lease_start_date) : undefined,
      lease_end_date: editTenant?.lease_end_date ? new Date(editTenant.lease_end_date) : undefined,
      security_deposit: editTenant?.security_deposit || 0,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        property_id: editTenant?.property_id || defaultPropertyId || "",
        name: editTenant?.name || "",
        email: editTenant?.email || "",
        phone: editTenant?.phone || "",
        move_in_date: editTenant?.move_in_date ? new Date(editTenant.move_in_date) : undefined,
        lease_start_date: editTenant?.lease_start_date ? new Date(editTenant.lease_start_date) : undefined,
        lease_end_date: editTenant?.lease_end_date ? new Date(editTenant.lease_end_date) : undefined,
        security_deposit: editTenant?.security_deposit || 0,
      });
    }
  }, [open, editTenant, defaultPropertyId, form]);

  const onSubmit = async (values: TenantFormValues) => {
    const payload = {
      property_id: values.property_id,
      name: values.name,
      email: values.email || undefined,
      phone: values.phone,
      move_in_date: format(values.move_in_date, "yyyy-MM-dd"),
      lease_start_date: format(values.lease_start_date, "yyyy-MM-dd"),
      lease_end_date: format(values.lease_end_date, "yyyy-MM-dd"),
      security_deposit: values.security_deposit,
    };

    if (editTenant) {
      await updateTenant.mutateAsync({ id: editTenant.id, ...payload });
    } else {
      await createTenant.mutateAsync(payload);
    }
    form.reset();
    onOpenChange(false);
  };

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
