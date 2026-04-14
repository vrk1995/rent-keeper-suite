

# System-Wide UX Automation & Simplification Plan

## Problem Statement
The current system has several areas where users must manually perform repetitive tasks, re-enter data that could be inferred, and navigate multiple pages for related workflows. This plan identifies every such area and proposes concrete improvements.

---

## 1. Eliminate Duplicate PDF Generation Code

**Current pain**: The exact same base64-to-blob-to-window.open logic is copy-pasted in Payments.tsx, Invoices.tsx, TenantDetailSheet.tsx, and MarkPaidDialog.tsx (4+ locations).

**Fix**: Create a single `src/lib/pdfUtils.ts` utility with `openPdfFromBase64(base64: string)` and `generateInvoicePdf(paymentId)` / `generateReceiptPdf(paymentId)` functions. Replace all duplicates with one-line calls.

---

## 2. Centralize Filter Options Derivation

**Current pain**: Every page (Payments, Invoices, Tenants, Documents, Reminders) independently derives `propertyOptions` and `tenantOptions` from their local data using identical `useMemo` patterns with `Map<string, string>`.

**Fix**: Create a shared `useFilterOptions()` hook that returns `{ propertyOptions, tenantOptions }` from the canonical `useProperties()` and `useTenants()` hooks. All pages import and use this single source.

---

## 3. Auto-Populate "Bill To" from Tenant Record

**Current pain**: When creating an invoice manually, users must re-enter tenant billing details. The tenant already has `bill_to_name`, `bill_to_address`, `bill_to_gstin` stored.

**Fix**: When a tenant is selected in the Create Invoice dialog, auto-fill the billing fields from the tenant record — same pattern already used for "Bill From" with owner selection.

---

## 4. Smart Defaults for Tenant Form

**Current pain**: The AddTenantDialog has 20+ fields. Many can be auto-filled:
- `lease_start_date` defaults to today but isn't set
- `move_in_date` could default to lease_start_date
- `rent_due_day` defaults to 1 but could inherit from previous tenants on the same property
- When a property has only one owner, billing details are auto-filled (already done), but `requires_gst` should auto-set to `true` if the owner has a GSTIN

**Fix**: Add intelligent defaults:
- `move_in_date` = `lease_start_date` (sync on change)
- `requires_gst` = `true` when selected owner has GSTIN
- Pre-fill `bill_to_name` with tenant name as user types it

---

## 5. Unified Status Badge & Config System

**Current pain**: Status colors/icons are defined separately in Payments.tsx, Invoices.tsx, and TenantDetailSheet.tsx with slightly different configs for the same statuses.

**Fix**: Create `src/lib/statusConfig.ts` exporting unified `paymentStatusConfig` and `invoiceStatusConfig` objects. All pages import from one source.

---

## 6. Remove Manual "Generate Payments" Step

**Current pain**: Users see a "Generate Payments" button on the Payments page and must manually trigger it for a specific month, even though `pg_cron` runs `daily_payment_processing()` automatically.

**Fix**: Remove the manual generate button for the current month (it's automated). Keep only a "Generate for Past/Future Month" option as an advanced action, perhaps in a dropdown menu, since it's rarely needed.

---

## 7. Auto-Link Invoices to Payments

**Current pain**: The manual "Create Invoice" dialog on the Invoices page creates standalone invoices not linked to any payment record. Meanwhile, the automated system creates linked invoices. This creates orphaned/duplicate invoices.

**Fix**: Hide the manual "Create Invoice" button (invoices are auto-created with payments). Instead, show a "Create Ad-hoc Invoice" option that makes it clear this is for non-rent charges. Add a `payment_id` column to invoices to formally link them.

---

## 8. Consolidate Property Selection UX

**Current pain**: The AddTenantDialog uses a standard `<Select>` for property selection while all filter bars use `<SearchableSelect>`. Inconsistent UX.

**Fix**: Replace all remaining standard `<Select>` dropdowns for property/tenant/owner selection in dialogs (AddTenantDialog, AddPropertyDialog, UploadDocumentDialog) with the `SearchableSelect` component.

---

## 9. Auto-Sync Invoice Status with Payment Status

**Current pain**: When a payment is marked as paid, the corresponding invoice status remains "sent". Users must manually update invoice status separately.

**Fix**: In the `useMarkPaymentPaid` mutation, after updating the payment, also update the matching invoice's status to "paid" (or "partial" for partial payments). This keeps them in sync automatically.

---

## 10. Simplify Owner Filter Cascade

**Current pain**: Owner filtering logic is duplicated across Properties.tsx, Tenants.tsx, Payments.tsx, and DashboardOverview.tsx — each re-implementing the same share-percentage and tenant-assignment checks.

**Fix**: Create a `useOwnerFilteredData()` hook that accepts raw data arrays and returns filtered versions based on `selectedOwnerId`. Centralizes the owner-share lookup and percentage calculation logic.

---

## Technical Summary

| # | Change | Files Affected | Complexity |
|---|--------|---------------|------------|
| 1 | PDF utility extraction | 4 pages + new lib file | Low |
| 2 | Shared filter options hook | 5 pages + new hook | Low |
| 3 | Auto-populate Bill To | Invoices dialog | Low |
| 4 | Smart tenant form defaults | AddTenantDialog | Low |
| 5 | Unified status config | 3 pages + new lib file | Low |
| 6 | Remove manual generate button | Payments.tsx | Low |
| 7 | Hide manual invoice creation | Invoices.tsx | Low |
| 8 | SearchableSelect in all dialogs | 3 dialogs | Low |
| 9 | Auto-sync invoice ↔ payment status | usePayments hook | Medium |
| 10 | Centralized owner filter logic | 4 pages + new hook | Medium |

All changes preserve existing functionality. No database migrations required (except optionally adding `payment_id` to invoices for item 7). The overall goal is fewer clicks, fewer repeated configurations, and consistent behavior across the app.

