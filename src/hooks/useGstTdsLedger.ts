import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GstLedgerEntry {
  id: string;
  date: string; // invoice_date, falling back to due_date for pre-invoice_date rows
  invoice_number: string;
  tenant_name: string;
  property_name: string;
  taxable_value: number;
  cgst: number;
  sgst: number;
  total_gst: number;
  invoice_total: number;
  status: string;
}

export interface TdsLedgerEntry {
  id: string;
  date: string; // paid_date — TDS is a fact of the receipt, not the invoice
  invoice_number: string;
  tenant_name: string;
  property_name: string;
  gross_amount: number;
  tds_amount: number;
  tds_rate: number; // derived (tds_amount / gross_amount), for readability only — not stored
  received_amount: number;
  payment_method: string | null;
}

/** Scope a ledger to one tenant, or aggregate across every tenant billed from one billing
 *  address (matched by name — billing_addresses isn't a live FK anywhere downstream of it,
 *  same natural-key pattern used for invoice numbering and rent agreements). */
export interface LedgerScope {
  tenantId?: string;
  billingAddressName?: string;
}

const scopeKey = (scope: LedgerScope) => `${scope.tenantId || ""}|${scope.billingAddressName || ""}`;

interface GstInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string;
  amount: number;
  status: string;
  tenant: { name: string } | null;
  property: { name: string } | null;
}

interface TenantIdRow {
  id: string;
}

interface TdsRentPaymentRow {
  id: string;
  tenant_id: string;
  property_id: string;
  due_date: string;
  amount: number;
  tenant: { name: string } | null;
  property: { name: string } | null;
}

interface TdsTransactionRow {
  id: string;
  rent_payment_id: string;
  paid_date: string;
  amount: number;
  tds_amount: number;
  received_amount: number;
  payment_method: string | null;
}

interface TdsInvoiceRow {
  invoice_number: string;
  property_id: string;
  tenant_id: string;
  due_date: string;
  amount: number;
}

export const useGstLedger = (scope: LedgerScope) => {
  return useQuery({
    queryKey: ["gst-ledger", scopeKey(scope)],
    queryFn: async (): Promise<GstLedgerEntry[]> => {
      let query = supabase
        .from("invoices")
        .select(
          "id, invoice_number, invoice_date, due_date, amount, status, tenant:tenants(name), property:properties(name)"
        )
        .eq("requires_gst", true)
        // Draft invoices haven't actually been issued yet, so there's no GST liability yet.
        .neq("status", "draft");

      if (scope.tenantId) {
        query = query.eq("tenant_id", scope.tenantId);
      } else if (scope.billingAddressName) {
        query = query.eq("bill_from_name", scope.billingAddressName);
      } else {
        return [];
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data as unknown as GstInvoiceRow[]) || []).map((inv) => {
        const taxable = Number(inv.amount) || 0;
        const cgst = taxable * 0.09;
        const sgst = taxable * 0.09;
        return {
          id: inv.id,
          date: inv.invoice_date || inv.due_date,
          invoice_number: inv.invoice_number,
          tenant_name: inv.tenant?.name || "",
          property_name: inv.property?.name || "",
          taxable_value: taxable,
          cgst,
          sgst,
          total_gst: cgst + sgst,
          invoice_total: taxable + cgst + sgst,
          status: inv.status,
        };
      });
    },
    enabled: !!(scope.tenantId || scope.billingAddressName),
  });
};

export const useTdsLedger = (scope: LedgerScope) => {
  return useQuery({
    queryKey: ["tds-ledger", scopeKey(scope)],
    queryFn: async (): Promise<TdsLedgerEntry[]> => {
      let tenantIds: string[] = [];
      if (scope.tenantId) {
        tenantIds = [scope.tenantId];
      } else if (scope.billingAddressName) {
        const { data: tenants, error } = await supabase
          .from("tenants")
          .select("id")
          .eq("bill_from_name", scope.billingAddressName);
        if (error) throw error;
        tenantIds = ((tenants as unknown as TenantIdRow[]) || []).map((t) => t.id);
      }
      if (tenantIds.length === 0) return [];

      const { data: paymentsData, error: paymentsError } = await supabase
        .from("rent_payments")
        .select("id, tenant_id, property_id, due_date, amount, tenant:tenants(name), property:properties(name)")
        .in("tenant_id", tenantIds);
      if (paymentsError) throw paymentsError;
      const payments = (paymentsData as unknown as TdsRentPaymentRow[]) || [];
      if (payments.length === 0) return [];

      const paymentIds = payments.map((p) => p.id);
      const { data: transactionsData, error: txError } = await supabase
        .from("payment_transactions")
        .select("id, rent_payment_id, paid_date, amount, tds_amount, received_amount, payment_method")
        .in("rent_payment_id", paymentIds)
        .gt("tds_amount", 0);
      if (txError) throw txError;
      const transactions = (transactionsData as unknown as TdsTransactionRow[]) || [];
      if (transactions.length === 0) return [];

      // Invoices aren't linked to payments by FK, so match on the natural key used
      // everywhere else in the app: property + tenant + due date + amount.
      const { data: invoicesData, error: invError } = await supabase
        .from("invoices")
        .select("invoice_number, property_id, tenant_id, due_date, amount")
        .in("tenant_id", tenantIds);
      if (invError) throw invError;

      const invoiceNumberByKey = new Map<string, string>();
      ((invoicesData as unknown as TdsInvoiceRow[]) || []).forEach((inv) => {
        invoiceNumberByKey.set(
          `${inv.property_id}|${inv.tenant_id}|${inv.due_date}|${Number(inv.amount).toFixed(2)}`,
          inv.invoice_number
        );
      });

      const paymentById = new Map(payments.map((p) => [p.id, p]));

      return transactions.map((t) => {
        const payment = paymentById.get(t.rent_payment_id);
        const key = payment
          ? `${payment.property_id}|${payment.tenant_id}|${payment.due_date}|${Number(payment.amount).toFixed(2)}`
          : "";
        const gross = Number(t.amount) || 0;
        const tds = Number(t.tds_amount) || 0;
        return {
          id: t.id,
          date: t.paid_date,
          invoice_number: invoiceNumberByKey.get(key) || "—",
          tenant_name: payment?.tenant?.name || "",
          property_name: payment?.property?.name || "",
          gross_amount: gross,
          tds_amount: tds,
          tds_rate: gross ? Math.round((tds / gross) * 1000) / 10 : 0,
          received_amount: Number(t.received_amount) || 0,
          payment_method: t.payment_method,
        };
      });
    },
    enabled: !!(scope.tenantId || scope.billingAddressName),
  });
};
