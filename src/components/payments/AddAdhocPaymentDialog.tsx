import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCreateExpense } from "@/hooks/useExpenses";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { usePropertyOwners } from "@/hooks/usePropertyOwners";
import { useTeamMembers } from "@/hooks/useTeam";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesAlert } from "@/components/ui/unsaved-changes-alert";

const schema = z
  .object({
    property_id: z.string().min(1, "Property is required"),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
    expense_date: z.date({ required_error: "Date is required" }),
    vendor_name: z.string().optional(),
    vendor_contact: z.string().optional(),
    category: z.string().optional(),
    payment_method: z.string().optional(),
    paid_by_type: z.string().min(1, "Please select who paid"),
    paid_by_value: z.string().optional(),
    paid_by_other: z.string().optional(),
  })
  .refine(
    (d) =>
      d.paid_by_type !== "other" ||
      (d.paid_by_other && d.paid_by_other.trim().length > 0),
    { message: "Please specify who paid", path: ["paid_by_other"] }
  )
  .refine(
    (d) =>
      d.paid_by_type === "other" ||
      (d.paid_by_value && d.paid_by_value.length > 0),
    { message: "Please select a person", path: ["paid_by_value"] }
  );


type FormData = z.infer<typeof schema>;

const categories = [
  { value: "taxes", label: "Taxes" },
  { value: "repairs", label: "Repairs" },
  { value: "maintenance", label: "Maintenance" },
  { value: "utilities", label: "Utilities" },
  { value: "insurance", label: "Insurance" },
  { value: "legal", label: "Legal" },
  { value: "cleaning", label: "Cleaning" },
  { value: "security", label: "Security" },
  { value: "general", label: "General" },
];

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
];

export function AddAdhocPaymentDialog() {
  const [open, setOpen] = useState(false);
  const createExpense = useCreateExpense();
  const { propertyOptions } = useFilterOptions();
  const { data: owners = [] } = usePropertyOwners();
  const { data: teamMembers = [] } = useTeamMembers();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      property_id: "",
      title: "",
      description: "",
      amount: 0,
      expense_date: new Date(),
      vendor_name: "",
      vendor_contact: "",
      category: "general",
      payment_method: "",
      paid_by_type: "",
      paid_by_value: "",
      paid_by_other: "",
    },
  });

  const paidByType = form.watch("paid_by_type");

  const resolvePaidBy = (data: FormData): string => {
    if (data.paid_by_type === "other") return `Other: ${data.paid_by_other?.trim()}`;
    if (data.paid_by_type === "owner") {
      const o = owners.find((x) => x.id === data.paid_by_value);
      return o ? `${o.name} (Owner)` : "";
    }
    if (data.paid_by_type === "team") {
      const m = teamMembers.find((x) => x.user_id === data.paid_by_value);
      return m ? `${m.profile?.full_name || "Team member"} (Team)` : "";
    }
    return "";
  };

  const onSubmit = async (data: FormData) => {
    await createExpense.mutateAsync({
      property_id: data.property_id,
      title: data.title,
      description: data.description,
      amount: data.amount,
      expense_date: format(data.expense_date, "yyyy-MM-dd"),
      vendor_name: data.vendor_name,
      vendor_contact: data.vendor_contact,
      category: data.category,
      payment_method: data.payment_method,
      paid_by: resolvePaidBy(data),
    });
    form.reset();
    setOpen(false);
  };


  const { guardedOnOpenChange, pendingClose, confirmDiscard, cancelDiscard } =
    useUnsavedChangesGuard(form.formState.isDirty, setOpen);

  return (
    <>
    <Dialog open={open} onOpenChange={guardedOnOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Record Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Ad-hoc Payment</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="property_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property *</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={propertyOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select property"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Property tax Q2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹) *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expense_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
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
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
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
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
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
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paymentMethods.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="paid_by_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid By *</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue("paid_by_value", "");
                        form.setValue("paid_by_other", "");
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="team">Team Member</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {paidByType === "owner" && (
                <FormField
                  control={form.control}
                  name="paid_by_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Owner *</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          options={owners.map((o) => ({ value: o.id, label: o.name }))}
                          value={field.value || ""}
                          onValueChange={field.onChange}
                          placeholder="Select owner"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {paidByType === "team" && (
                <FormField
                  control={form.control}
                  name="paid_by_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Member *</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          options={teamMembers.map((m) => ({
                            value: m.user_id,
                            label: m.profile?.full_name || "Unnamed",
                          }))}
                          value={field.value || ""}
                          onValueChange={field.onChange}
                          placeholder="Select team member"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {paidByType === "other" && (
                <FormField
                  control={form.control}
                  name="paid_by_other"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Please specify *</FormLabel>
                      <FormControl>
                        <Input placeholder="Name of payer" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>


            <FormField
              control={form.control}
              name="vendor_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor / Payee</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Municipal Corporation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vendor_contact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor Contact</FormLabel>
                  <FormControl>
                    <Input placeholder="Phone or email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Additional details..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => guardedOnOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createExpense.isPending}>
                {createExpense.isPending ? "Saving..." : "Record Payment"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    <UnsavedChangesAlert open={pendingClose} onConfirm={confirmDiscard} onCancel={cancelDiscard} />
    </>
  );
}
