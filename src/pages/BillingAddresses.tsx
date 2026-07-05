import { useState } from "react";
import { Plus, Edit, Trash2, Star, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useBillingAddresses,
  useCreateBillingAddress,
  useUpdateBillingAddress,
  useDeleteBillingAddress,
  BillingAddress,
} from "@/hooks/useBillingAddresses";
import { ErrorState } from "@/components/ui/error-state";

interface BillingAddressFormData {
  name: string;
  address: string;
  gstin: string;
  is_default: boolean;
}

const BillingAddresses = () => {
  const { data: addresses, isLoading, isError, refetch } = useBillingAddresses();
  const createAddress = useCreateBillingAddress();
  const updateAddress = useUpdateBillingAddress();
  const deleteAddress = useDeleteBillingAddress();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAddress, setEditAddress] = useState<BillingAddress | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<BillingAddressFormData>({
    name: "",
    address: "",
    gstin: "",
    is_default: false,
  });

  const handleOpenDialog = (address?: BillingAddress) => {
    if (address) {
      setEditAddress(address);
      setFormData({
        name: address.name,
        address: address.address || "",
        gstin: address.gstin || "",
        is_default: address.is_default,
      });
    } else {
      setEditAddress(null);
      setFormData({ name: "", address: "", gstin: "", is_default: false });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditAddress(null);
    setFormData({ name: "", address: "", gstin: "", is_default: false });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editAddress) {
      await updateAddress.mutateAsync({
        id: editAddress.id,
        name: formData.name,
        address: formData.address || null,
        gstin: formData.gstin || null,
        is_default: formData.is_default,
      });
    } else {
      await createAddress.mutateAsync({
        name: formData.name,
        address: formData.address || undefined,
        gstin: formData.gstin || undefined,
        is_default: formData.is_default,
      });
    }
    handleCloseDialog();
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteAddress.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Billing Addresses</h1>
          <p className="text-muted-foreground">
            Manage your "Bill From" addresses for invoices
          </p>
        </div>
        <Button variant="hero" onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Add Address
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-secondary/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : addresses?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No billing addresses yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add your company or personal billing details to use when creating tenant invoices
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Address
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {addresses?.map((address) => (
            <Card key={address.id} className={address.is_default ? "border-primary" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{address.name}</CardTitle>
                    {address.is_default && (
                      <Badge variant="glow" className="gap-1">
                        <Star className="w-3 h-3" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit billing address"
                      onClick={() => handleOpenDialog(address)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete billing address"
                      onClick={() => setDeleteId(address.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {address.address && (
                  <p className="text-sm text-muted-foreground whitespace-pre-line mb-2">
                    {address.address}
                  </p>
                )}
                {address.gstin && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">GSTIN:</span>{" "}
                    <span className="font-mono">{address.gstin}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editAddress ? "Edit Billing Address" : "Add Billing Address"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company/Person Name *</Label>
              <Input
                id="name"
                placeholder="e.g., ABC Properties Pvt Ltd"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                placeholder="Full address including city, state, PIN"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                placeholder="e.g., 22AAAAA0000A1Z5"
                value={formData.gstin}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                maxLength={15}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div>
                <Label htmlFor="is_default" className="font-medium">
                  Set as Default
                </Label>
                <p className="text-xs text-muted-foreground">
                  Auto-select this address when adding tenants
                </p>
              </div>
              <Switch
                id="is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_default: checked })
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAddress.isPending || updateAddress.isPending}
              >
                {createAddress.isPending || updateAddress.isPending
                  ? "Saving..."
                  : editAddress
                  ? "Update"
                  : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Billing Address?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this billing address. This action cannot be undone.
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
};

export default BillingAddresses;
