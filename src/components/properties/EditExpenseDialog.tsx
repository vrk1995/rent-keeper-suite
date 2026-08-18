import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, ExternalLink, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { ComboboxInput } from "@/components/ui/combobox-input";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Expense,
  useUpdateExpense,
  useExpenseTitleSuggestions,
  uploadExpenseReceipt,
  deleteExpenseReceiptFile,
  getExpenseReceiptViewUrl,
} from "@/hooks/useExpenses";
import { useFloorUnitsByProperty } from "@/hooks/useFloorUnits";
import { usePropertyFloors } from "@/hooks/usePropertyFloors";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesAlert } from "@/components/ui/unsaved-changes-alert";
import { ExpensePeriodFields } from "./ExpensePeriodFields";

const expenseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  expense_date: z.date({ required_error: "Date is required" }),
  vendor_name: z.string().optional(),
  vendor_contact: z.string().optional(),
  category: z.string().optional(),
  payment_method: z.string().optional(),
  floor_unit_id: z.string().optional(),
  period_from: z.date().optional(),
  period_to: z.date().optional(),
}).refine((data) => !data.period_from || !data.period_to || data.period_to >= data.period_from, {
  message: "To date must be on or after the From date",
  path: ["period_to"],
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface EditExpenseDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const expenseCategories = [
  { value: "maintenance", label: "Maintenance" },
  { value: "repairs", label: "Repairs" },
  { value: "utilities", label: "Utilities" },
  { value: "insurance", label: "Insurance" },
  { value: "taxes", label: "Taxes" },
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

export function EditExpenseDialog({ expense, open, onOpenChange }: EditExpenseDialogProps) {
  const updateExpense = useUpdateExpense();
  const { data: floorUnits } = useFloorUnitsByProperty(expense?.property_id || "");
  const { data: floors } = usePropertyFloors(expense?.property_id || "");
  const { data: titleSuggestions } = useExpenseTitleSuggestions();

  const [newReceiptFile, setNewReceiptFile] = useState<File | null>(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isViewingReceipt, setIsViewingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      title: "",
      description: "",
      amount: 0,
      expense_date: new Date(),
      vendor_name: "",
      vendor_contact: "",
      category: "general",
      payment_method: "",
      floor_unit_id: "",
      period_from: undefined,
      period_to: undefined,
    },
  });

  // Load this expense's values fresh each time the dialog opens for it.
  useEffect(() => {
    if (!open || !expense) return;
    form.reset({
      title: expense.title,
      description: expense.description || "",
      amount: expense.amount,
      expense_date: new Date(expense.expense_date),
      vendor_name: expense.vendor_name || "",
      vendor_contact: expense.vendor_contact || "",
      category: expense.category || "general",
      payment_method: expense.payment_method || "",
      floor_unit_id: expense.floor_unit_id || "",
      period_from: expense.period_from ? new Date(expense.period_from) : undefined,
      period_to: expense.period_to ? new Date(expense.period_to) : undefined,
    });
    setNewReceiptFile(null);
    setRemoveExistingReceipt(false);
  }, [open, expense?.id]);

  const handleViewReceipt = async () => {
    if (!expense?.receipt_url) return;
    setIsViewingReceipt(true);
    try {
      const url = await getExpenseReceiptViewUrl(expense.receipt_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Couldn't open receipt: " + (err as Error).message);
    } finally {
      setIsViewingReceipt(false);
    }
  };

  const onSubmit = async (data: ExpenseFormData) => {
    if (!expense) return;

    const oldPath = expense.receipt_url;
    let receiptPath: string | null | undefined = oldPath;

    if (newReceiptFile) {
      setIsUploadingReceipt(true);
      try {
        receiptPath = await uploadExpenseReceipt(newReceiptFile, expense.property_id);
      } catch (err) {
        toast.error("Failed to upload receipt: " + (err as Error).message);
        setIsUploadingReceipt(false);
        return;
      }
      setIsUploadingReceipt(false);
    } else if (removeExistingReceipt) {
      receiptPath = null;
    }

    await updateExpense.mutateAsync({
      id: expense.id,
      floor_unit_id: data.floor_unit_id || null,
      title: data.title,
      description: data.description || null,
      amount: data.amount,
      expense_date: format(data.expense_date, "yyyy-MM-dd"),
      vendor_name: data.vendor_name || null,
      vendor_contact: data.vendor_contact || null,
      category: data.category || null,
      payment_method: data.payment_method || null,
      receipt_url: receiptPath,
      period_from: data.period_from ? format(data.period_from, "yyyy-MM-dd") : null,
      period_to: data.period_to ? format(data.period_to, "yyyy-MM-dd") : null,
    });

    // Only clean up the old file once the row itself has been updated to point elsewhere.
    if (oldPath && oldPath !== receiptPath) {
      deleteExpenseReceiptFile(oldPath).catch((err) =>
        console.error("Failed to delete replaced receipt file:", err)
      );
    }

    onOpenChange(false);
  };

  const isDirty =
    form.formState.isDirty || !!newReceiptFile || removeExistingReceipt;
  const { guardedOnOpenChange, pendingClose, confirmDiscard, cancelDiscard } =
    useUnsavedChangesGuard(isDirty, onOpenChange);

  const hasExistingReceipt = !!expense?.receipt_url && !removeExistingReceipt;

  return (
    <>
    {expense && (
    <Dialog open={open} onOpenChange={guardedOnOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
          <DialogDescription>Update the details for this expense.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <ComboboxInput
                      placeholder="e.g., Plumbing repair"
                      value={field.value}
                      onValueChange={field.onChange}
                      suggestions={titleSuggestions || []}
                    />
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
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
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
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {expenseCategories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
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
              name="vendor_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., ABC Plumbers" {...field} />
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

            {floorUnits && floorUnits.length > 0 && (
              <FormField
                control={form.control}
                name="floor_unit_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit / Corp No. (optional)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "__none" ? "" : v)}
                      value={field.value || "__none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Tag a corp no. (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none">Whole property</SelectItem>
                        {floorUnits.map((u) => {
                          const floorName = floors?.find(f => f.id === u.floor_id)?.floor_name;
                          return (
                            <SelectItem key={u.id} value={u.id}>
                              {u.corp_number}
                              <span className="text-muted-foreground ml-2 text-xs">
                                {floorName ? `(F: ${floorName})` : ""}
                              </span>
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

            <ExpensePeriodFields
              periodFrom={form.watch("period_from")}
              periodTo={form.watch("period_to")}
              onChange={(from, to) => {
                form.setValue("period_from", from, { shouldDirty: true });
                form.setValue("period_to", to, { shouldDirty: true, shouldValidate: true });
              }}
            />
            {form.formState.errors.period_to && (
              <p className="text-sm font-medium text-destructive -mt-2">
                {form.formState.errors.period_to.message}
              </p>
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Additional details..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Receipt / Bill (optional)</FormLabel>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setNewReceiptFile(e.target.files?.[0] || null)}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
              />
              {newReceiptFile ? (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <Upload className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{newReceiptFile.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Cancel new receipt"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => setNewReceiptFile(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : hasExistingReceipt ? (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={handleViewReceipt}
                    disabled={isViewingReceipt}
                  >
                    <ExternalLink className="w-4 h-4 mr-1.5" />
                    {isViewingReceipt ? "Opening..." : "View current receipt"}
                  </Button>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove receipt"
                      className="h-8 w-8"
                      onClick={() => setRemoveExistingReceipt(true)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Attach scanned bill (photo or PDF)
                </Button>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => guardedOnOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateExpense.isPending || isUploadingReceipt}>
                {isUploadingReceipt ? "Uploading receipt..." : updateExpense.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    )}
    <UnsavedChangesAlert open={pendingClose} onConfirm={confirmDiscard} onCancel={cancelDiscard} />
    </>
  );
}
