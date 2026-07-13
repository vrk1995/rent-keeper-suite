import { useState } from "react";
import { Plus, Edit, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  useBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
  BankAccount,
} from "@/hooks/useBillingAddressBankAccounts";

interface BankAccountsSectionProps {
  billingAddressId: string;
}

interface BankAccountFormData {
  bank_name: string;
  account_number: string;
  ifsc: string;
  is_default: boolean;
}

const EMPTY_FORM: BankAccountFormData = { bank_name: "", account_number: "", ifsc: "", is_default: false };

export function BankAccountsSection({ billingAddressId }: BankAccountsSectionProps) {
  const { data: accounts } = useBankAccounts(billingAddressId);
  const createAccount = useCreateBankAccount();
  const updateAccount = useUpdateBankAccount();
  const deleteAccount = useDeleteBankAccount();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<BankAccountFormData>(EMPTY_FORM);

  const handleOpenDialog = (account?: BankAccount) => {
    if (account) {
      setEditAccount(account);
      setFormData({
        bank_name: account.bank_name,
        account_number: account.account_number,
        ifsc: account.ifsc,
        is_default: account.is_default,
      });
    } else {
      setEditAccount(null);
      setFormData(EMPTY_FORM);
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.bank_name.trim() || !formData.account_number.trim() || !formData.ifsc.trim()) return;

    if (editAccount) {
      await updateAccount.mutateAsync({
        id: editAccount.id,
        billing_address_id: billingAddressId,
        bank_name: formData.bank_name.trim(),
        account_number: formData.account_number.trim(),
        ifsc: formData.ifsc.trim().toUpperCase(),
        is_default: formData.is_default,
      });
    } else {
      await createAccount.mutateAsync({
        billing_address_id: billingAddressId,
        bank_name: formData.bank_name.trim(),
        account_number: formData.account_number.trim(),
        ifsc: formData.ifsc.trim().toUpperCase(),
        is_default: formData.is_default,
      });
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteAccount.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Bank Accounts</p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleOpenDialog()}>
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      {!accounts?.length ? (
        <p className="text-xs text-muted-foreground">No bank accounts saved.</p>
      ) : (
        <div className="space-y-1.5">
          {accounts.map((account) => (
            <div key={account.id} className="flex items-center justify-between text-xs p-2 rounded-lg border bg-muted/20">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">{account.bank_name}</span>
                  {account.is_default && (
                    <Badge variant="glow" className="gap-1 text-[10px] px-1.5 py-0">
                      <Star className="w-2.5 h-2.5" />
                      Default
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground font-mono">
                  {account.account_number} &middot; {account.ifsc}
                </p>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Edit bank account"
                  onClick={() => handleOpenDialog(account)}
                >
                  <Edit className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Delete bank account"
                  onClick={() => setDeleteId(account.id)}
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editAccount ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bank_name">Bank Name</Label>
              <Input
                id="bank_name"
                placeholder="e.g., HDFC Bank"
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_number">Account Number</Label>
              <Input
                id="account_number"
                placeholder="e.g., 000123456789"
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ifsc">IFSC Code</Label>
              <Input
                id="ifsc"
                placeholder="e.g., HDFC0000123"
                value={formData.ifsc}
                onChange={(e) => setFormData({ ...formData, ifsc: e.target.value.toUpperCase() })}
                required
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div>
                <Label htmlFor="bank_is_default" className="font-medium">
                  Set as Default
                </Label>
                <p className="text-xs text-muted-foreground">
                  Auto-select for tenants using this billing address
                </p>
              </div>
              <Switch
                id="bank_is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createAccount.isPending || updateAccount.isPending}>
                {createAccount.isPending || updateAccount.isPending ? "Saving..." : editAccount ? "Update" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bank Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this bank account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
