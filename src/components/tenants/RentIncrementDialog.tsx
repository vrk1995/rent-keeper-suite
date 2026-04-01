import { useState } from "react";
import { format, differenceInDays } from "date-fns";
import { TrendingUp, Plus, Trash2, History, CalendarIcon, Check, IndianRupee, Percent } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/currency";
import {
  useRentIncrements,
  useRentIncrementHistory,
  useCreateRentIncrement,
  useDeleteRentIncrement,
  useApplyRentIncrement,
} from "@/hooks/useRentIncrements";
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

interface RentIncrementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  currentRent: number;
}

const RentIncrementDialog = ({ open, onOpenChange, tenantId, tenantName, currentRent }: RentIncrementDialogProps) => {
  const { data: increments = [] } = useRentIncrements(tenantId);
  const { data: history = [] } = useRentIncrementHistory(tenantId);
  const createIncrement = useCreateRentIncrement();
  const deleteIncrement = useDeleteRentIncrement();
  const applyIncrement = useApplyRentIncrement();

  const [showAddForm, setShowAddForm] = useState(false);
  const [incrementType, setIncrementType] = useState<string>("percentage");
  const [incrementValue, setIncrementValue] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("12");
  const [nextDate, setNextDate] = useState<Date | undefined>();
  const [applyConfirm, setApplyConfirm] = useState<string | null>(null);
  const [applyNotes, setApplyNotes] = useState("");

  const resetForm = () => {
    setShowAddForm(false);
    setIncrementType("percentage");
    setIncrementValue("");
    setIntervalMonths("12");
    setNextDate(undefined);
  };

  const handleAdd = () => {
    if (!incrementValue || !nextDate) return;
    createIncrement.mutate(
      {
        tenant_id: tenantId,
        increment_type: incrementType as "percentage" | "fixed",
        increment_value: parseFloat(incrementValue),
        interval_months: parseInt(intervalMonths),
        next_increment_date: format(nextDate, "yyyy-MM-dd"),
        is_active: true,
      },
      { onSuccess: resetForm }
    );
  };

  const handleApply = () => {
    const inc = increments.find((i) => i.id === applyConfirm);
    if (!inc) return;
    applyIncrement.mutate(
      {
        tenantId,
        currentRent,
        incrementType: inc.increment_type,
        incrementValue: inc.increment_value,
        nextIncrementDate: inc.next_increment_date,
        intervalMonths: inc.interval_months,
        incrementId: inc.id,
        notes: applyNotes || undefined,
      },
      {
        onSuccess: () => {
          setApplyConfirm(null);
          setApplyNotes("");
        },
      }
    );
  };

  const previewNewRent = (type: string, value: number) => {
    return type === "percentage"
      ? Math.round(currentRent * (1 + value / 100))
      : currentRent + value;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Rent Increments — {tenantName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between bg-primary/5 rounded-lg p-3 mb-2">
            <span className="text-sm text-muted-foreground">Current Rent</span>
            <span className="text-lg font-bold">{formatINR(currentRent)}/mo</span>
          </div>

          <Tabs defaultValue="rules" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="rules" className="flex-1">
                <TrendingUp className="w-4 h-4 mr-1" /> Rules
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                <History className="w-4 h-4 mr-1" /> History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="rules" className="space-y-3 mt-3">
              {increments.length === 0 && !showAddForm && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No increment rules set. Add one to auto-track rent increases.
                </p>
              )}

              {increments.map((inc) => {
                const daysUntil = differenceInDays(new Date(inc.next_increment_date), new Date());
                const newRent = previewNewRent(inc.increment_type, inc.increment_value);
                return (
                  <div key={inc.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {inc.increment_type === "percentage" ? (
                          <Badge variant="secondary"><Percent className="w-3 h-3 mr-1" />{inc.increment_value}%</Badge>
                        ) : (
                          <Badge variant="secondary"><IndianRupee className="w-3 h-3 mr-1" />{formatINR(inc.increment_value)}</Badge>
                        )}
                        <span className="text-sm text-muted-foreground">every {inc.interval_months} months</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteIncrement.mutate({ id: inc.id, tenantId })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>
                        Next: <strong>{format(new Date(inc.next_increment_date), "dd MMM yyyy")}</strong>
                        {daysUntil >= 0 && (
                          <Badge variant={daysUntil <= 30 ? "destructive" : "outline"} className="ml-2 text-xs">
                            {daysUntil === 0 ? "Today" : `${daysUntil}d away`}
                          </Badge>
                        )}
                        {daysUntil < 0 && (
                          <Badge variant="destructive" className="ml-2 text-xs">Overdue</Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm bg-secondary/30 rounded p-2">
                      <span className="text-muted-foreground">New rent will be</span>
                      <span className="font-semibold text-primary">{formatINR(newRent)}/mo</span>
                    </div>
                    <Button
                      size="sm"
                      variant="hero"
                      className="w-full"
                      onClick={() => setApplyConfirm(inc.id)}
                    >
                      <Check className="w-4 h-4 mr-1" /> Apply Increment Now
                    </Button>
                  </div>
                );
              })}

              {showAddForm ? (
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Type</Label>
                      <Select value={incrementType} onValueChange={setIncrementType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                          <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{incrementType === "percentage" ? "Percentage" : "Amount"}</Label>
                      <Input
                        type="number"
                        placeholder={incrementType === "percentage" ? "e.g. 5" : "e.g. 2000"}
                        value={incrementValue}
                        onChange={(e) => setIncrementValue(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Interval</Label>
                    <Select value={intervalMonths} onValueChange={setIntervalMonths}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">Every 6 months</SelectItem>
                        <SelectItem value="12">Every 12 months</SelectItem>
                        <SelectItem value="24">Every 24 months</SelectItem>
                        <SelectItem value="36">Every 36 months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Next Increment Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !nextDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {nextDate ? format(nextDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={nextDate} onSelect={setNextDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {incrementValue && nextDate && (
                    <div className="bg-secondary/30 rounded p-2 text-sm">
                      Preview: {formatINR(currentRent)} → <strong className="text-primary">{formatINR(previewNewRent(incrementType, parseFloat(incrementValue)))}</strong>/mo
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={resetForm}>Cancel</Button>
                    <Button variant="hero" className="flex-1" onClick={handleAdd} disabled={!incrementValue || !nextDate || createIncrement.isPending}>
                      Save Rule
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setShowAddForm(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Increment Rule
                </Button>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No rent changes recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="border rounded-lg p-3 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{format(new Date(h.effective_date), "dd MMM yyyy")}</span>
                        <Badge variant="outline">
                          {h.increment_type === "percentage" ? `${h.increment_value}%` : formatINR(h.increment_value)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{formatINR(h.previous_rent)}</span>
                        <span>→</span>
                        <span className="font-semibold text-primary">{formatINR(h.new_rent)}</span>
                      </div>
                      {h.notes && <p className="text-muted-foreground text-xs">{h.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!applyConfirm} onOpenChange={() => { setApplyConfirm(null); setApplyNotes(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Rent Increment</AlertDialogTitle>
            <AlertDialogDescription>
              {applyConfirm && (() => {
                const inc = increments.find((i) => i.id === applyConfirm);
                if (!inc) return null;
                const newRent = previewNewRent(inc.increment_type, inc.increment_value);
                return (
                  <div className="space-y-2 mt-2">
                    <p>This will update the rent from <strong>{formatINR(currentRent)}</strong> to <strong>{formatINR(newRent)}</strong>/mo.</p>
                    <Textarea
                      placeholder="Optional notes (e.g., annual revision as per agreement)"
                      value={applyNotes}
                      onChange={(e) => setApplyNotes(e.target.value)}
                    />
                  </div>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply}>Apply Increment</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default RentIncrementDialog;
