import { useState } from "react";
import { Building2, Percent } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useBillingAddresses, BillingAddress } from "@/hooks/useBillingAddresses";
import { GstTdsLedgerPanel } from "@/components/ledger/GstTdsLedgerPanel";
import { ErrorState } from "@/components/ui/error-state";

const GstTdsReports = () => {
  const { data: addresses, isLoading, isError, refetch } = useBillingAddresses();
  const [selectedAddress, setSelectedAddress] = useState<BillingAddress | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold">GST/TDS Reports</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          GST and TDS ledgers aggregated across every tenant billed from each address
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-secondary/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : addresses?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Percent className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No billing addresses yet</h3>
            <p className="text-muted-foreground text-center">
              Add a billing address first — GST/TDS ledgers are organized by billing entity.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {addresses?.map((address) => (
            <Card key={address.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <CardTitle className="text-lg truncate">{address.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {address.gstin && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">GSTIN:</span>{" "}
                    <span className="font-mono">{address.gstin}</span>
                  </p>
                )}
                {!address.gstin && (
                  <Badge variant="outline" className="text-xs">No GSTIN on file</Badge>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedAddress(address)}>
                  <Percent className="w-4 h-4 mr-1.5" />
                  View Ledger
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!selectedAddress} onOpenChange={(open) => !open && setSelectedAddress(null)}>
        <SheetContent className="sm:max-w-[900px] w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedAddress?.name} — GST/TDS Ledger</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {selectedAddress && (
              <GstTdsLedgerPanel
                scope={{ billingAddressName: selectedAddress.name }}
                showEntityColumns
                entityLabel={selectedAddress.name}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default GstTdsReports;
