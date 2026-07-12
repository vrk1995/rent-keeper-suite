import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Tenant, useUpdateTenant } from "@/hooks/useTenants";
import AddTenantDialog from "./AddTenantDialog";

interface VacateTenantDialogProps {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVacated?: () => void;
}

const VacateTenantDialog = ({ tenant, open, onOpenChange, onVacated }: VacateTenantDialogProps) => {
  const updateTenant = useUpdateTenant();
  const [vacateDate, setVacateDate] = useState<Date>(new Date());
  const [hasReplacement, setHasReplacement] = useState<"yes" | "no">("no");
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [prefillTenant, setPrefillTenant] = useState<Tenant | null>(null);

  const handleConfirm = async () => {
    if (!tenant) return;
    await updateTenant.mutateAsync({
      id: tenant.id,
      status: "vacated",
      lease_end_date: format(vacateDate, "yyyy-MM-dd"),
    });
    onOpenChange(false);
    onVacated?.();
    if (hasReplacement === "yes") {
      setPrefillTenant(tenant);
      setReplacementOpen(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="w-5 h-5 text-warning" />
              Vacate Tenant
            </DialogTitle>
            <DialogDescription>
              Mark <span className="font-medium text-foreground">{tenant?.name}</span> as vacated. The unit / area will become available.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Vacate Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !vacateDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {vacateDate ? format(vacateDate, "PPP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={vacateDate} onSelect={(d) => d && setVacateDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Is there a new tenant taking over this space?</Label>
              <RadioGroup value={hasReplacement} onValueChange={(v) => setHasReplacement(v as "yes" | "no")} className="flex gap-6">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="rep-no" />
                  <Label htmlFor="rep-no" className="font-normal cursor-pointer">No — mark vacant</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="rep-yes" />
                  <Label htmlFor="rep-yes" className="font-normal cursor-pointer">Yes — add new tenant</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={updateTenant.isPending}>
              {updateTenant.isPending ? "Saving..." : "Confirm Vacate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {prefillTenant && (
        <AddTenantDialog
          open={replacementOpen}
          onOpenChange={(o) => {
            setReplacementOpen(o);
            if (!o) setPrefillTenant(null);
          }}
          prefillFromTenant={prefillTenant}
        />
      )}
    </>
  );
};

export default VacateTenantDialog;
