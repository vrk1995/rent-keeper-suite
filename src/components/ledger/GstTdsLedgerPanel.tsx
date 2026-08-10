import { useMemo } from "react";
import { format } from "date-fns";
import { Download, Receipt, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFinancialYear } from "@/contexts/FinancialYearContext";
import { useGstLedger, useTdsLedger, LedgerScope } from "@/hooks/useGstTdsLedger";
import { formatINR } from "@/lib/currency";
import { downloadCsv } from "@/lib/csv";

interface GstTdsLedgerPanelProps {
  scope: LedgerScope;
  /** Show Tenant/Property columns — needed when aggregating across several tenants
   *  (billing-address level); not needed when already scoped to a single tenant. */
  showEntityColumns?: boolean;
  /** Used only to name the downloaded CSV file. */
  entityLabel?: string;
}

export function GstTdsLedgerPanel({ scope, showEntityColumns = false, entityLabel = "ledger" }: GstTdsLedgerPanelProps) {
  const { selectedFY } = useFinancialYear();
  const { data: gstEntries = [], isLoading: gstLoading } = useGstLedger(scope);
  const { data: tdsEntries = [], isLoading: tdsLoading } = useTdsLedger(scope);

  const filteredGst = useMemo(() => {
    const inRange = (dateStr: string) =>
      !selectedFY || (dateStr >= selectedFY.startDate && dateStr <= selectedFY.endDate);
    return gstEntries.filter((e) => inRange(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  }, [gstEntries, selectedFY]);

  const filteredTds = useMemo(() => {
    const inRange = (dateStr: string) =>
      !selectedFY || (dateStr >= selectedFY.startDate && dateStr <= selectedFY.endDate);
    return tdsEntries.filter((e) => inRange(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  }, [tdsEntries, selectedFY]);

  const gstTotals = filteredGst.reduce(
    (acc, e) => ({
      taxable: acc.taxable + e.taxable_value,
      cgst: acc.cgst + e.cgst,
      sgst: acc.sgst + e.sgst,
      total_gst: acc.total_gst + e.total_gst,
      invoice_total: acc.invoice_total + e.invoice_total,
    }),
    { taxable: 0, cgst: 0, sgst: 0, total_gst: 0, invoice_total: 0 }
  );

  const tdsTotals = filteredTds.reduce(
    (acc, e) => ({
      gross: acc.gross + e.gross_amount,
      tds: acc.tds + e.tds_amount,
      gst: acc.gst + e.gst_amount,
      received: acc.received + e.received_amount,
    }),
    { gross: 0, tds: 0, gst: 0, received: 0 }
  );

  const handleDownloadGst = () => {
    const headers = [
      "Date", "Invoice #",
      ...(showEntityColumns ? ["Tenant", "Property"] : []),
      "Taxable Value", "CGST (9%)", "SGST (9%)", "Total GST", "Invoice Total", "Status",
    ];
    const rows = filteredGst.map((e) => [
      e.date,
      e.invoice_number,
      ...(showEntityColumns ? [e.tenant_name, e.property_name] : []),
      e.taxable_value.toFixed(2),
      e.cgst.toFixed(2),
      e.sgst.toFixed(2),
      e.total_gst.toFixed(2),
      e.invoice_total.toFixed(2),
      e.status,
    ]);
    downloadCsv(`GST-Ledger-${entityLabel.replace(/\s+/g, "-")}.csv`, headers, rows);
  };

  const handleDownloadTds = () => {
    const headers = [
      "Date", "Invoice #",
      ...(showEntityColumns ? ["Tenant", "Property"] : []),
      "Gross Amount", "TDS Amount", "TDS %", "GST Amount", "Received Amount", "Payment Method",
    ];
    const rows = filteredTds.map((e) => [
      e.date,
      e.invoice_number,
      ...(showEntityColumns ? [e.tenant_name, e.property_name] : []),
      e.gross_amount.toFixed(2),
      e.tds_amount.toFixed(2),
      `${e.tds_rate}%`,
      e.gst_amount.toFixed(2),
      e.received_amount.toFixed(2),
      e.payment_method || "—",
    ]);
    downloadCsv(`TDS-Ledger-${entityLabel.replace(/\s+/g, "-")}.csv`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* GST Ledger */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            GST Ledger
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleDownloadGst} disabled={filteredGst.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {gstLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : filteredGst.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No GST-applicable invoices {selectedFY ? `in ${selectedFY.label}` : "yet"}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    {showEntityColumns && <TableHead>Tenant</TableHead>}
                    {showEntityColumns && <TableHead>Property</TableHead>}
                    <TableHead className="text-right">Taxable Value</TableHead>
                    <TableHead className="text-right">CGST (9%)</TableHead>
                    <TableHead className="text-right">SGST (9%)</TableHead>
                    <TableHead className="text-right">Total GST</TableHead>
                    <TableHead className="text-right">Invoice Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGst.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-mono text-xs">{e.invoice_number}</TableCell>
                      {showEntityColumns && <TableCell>{e.tenant_name}</TableCell>}
                      {showEntityColumns && <TableCell>{e.property_name}</TableCell>}
                      <TableCell className="text-right">{formatINR(e.taxable_value)}</TableCell>
                      <TableCell className="text-right">{formatINR(e.cgst)}</TableCell>
                      <TableCell className="text-right">{formatINR(e.sgst)}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(e.total_gst)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatINR(e.invoice_total)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">{e.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={showEntityColumns ? 4 : 2}>Total</TableCell>
                    <TableCell className="text-right">{formatINR(gstTotals.taxable)}</TableCell>
                    <TableCell className="text-right">{formatINR(gstTotals.cgst)}</TableCell>
                    <TableCell className="text-right">{formatINR(gstTotals.sgst)}</TableCell>
                    <TableCell className="text-right">{formatINR(gstTotals.total_gst)}</TableCell>
                    <TableCell className="text-right">{formatINR(gstTotals.invoice_total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TDS Ledger */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            TDS Ledger
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleDownloadTds} disabled={filteredTds.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {tdsLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : filteredTds.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No TDS-deducted receipts {selectedFY ? `in ${selectedFY.label}` : "yet"}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    {showEntityColumns && <TableHead>Tenant</TableHead>}
                    {showEntityColumns && <TableHead>Property</TableHead>}
                    <TableHead className="text-right">Gross Amount</TableHead>
                    <TableHead className="text-right">TDS Amount</TableHead>
                    <TableHead className="text-right">TDS %</TableHead>
                    <TableHead className="text-right">GST Amount</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTds.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-mono text-xs">{e.invoice_number}</TableCell>
                      {showEntityColumns && <TableCell>{e.tenant_name}</TableCell>}
                      {showEntityColumns && <TableCell>{e.property_name}</TableCell>}
                      <TableCell className="text-right">{formatINR(e.gross_amount)}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(e.tds_amount)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{e.tds_rate}%</TableCell>
                      <TableCell className="text-right">{e.gst_amount > 0 ? formatINR(e.gst_amount) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatINR(e.received_amount)}</TableCell>
                      <TableCell className="capitalize">{e.payment_method?.replace("_", " ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={showEntityColumns ? 4 : 2}>Total</TableCell>
                    <TableCell className="text-right">{formatINR(tdsTotals.gross)}</TableCell>
                    <TableCell className="text-right">{formatINR(tdsTotals.tds)}</TableCell>
                    <TableCell />
                    <TableCell className="text-right">{formatINR(tdsTotals.gst)}</TableCell>
                    <TableCell className="text-right">{formatINR(tdsTotals.received)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
