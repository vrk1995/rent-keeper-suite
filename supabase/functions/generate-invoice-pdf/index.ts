import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { authorizePropertyAccess } from "../_shared/authorizeCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceRequest {
  paymentId: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { paymentId }: InvoiceRequest = await req.json();

    if (!paymentId) {
      return new Response(JSON.stringify({ error: "Payment ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Generating invoice for payment:", paymentId);

    // Fetch payment with tenant and property details (including invoice_prefix and owner_id)
    const { data: payment, error: paymentError } = await supabase
      .from("rent_payments")
      .select(
        `
        *,
        tenant:tenants(
          id,
          name,
          email,
          phone,
          requires_gst,
          bill_from_name,
          bill_from_address,
          bill_from_gstin,
          bill_from_pan,
          bill_from_bank_name,
          bill_from_account_number,
          bill_from_ifsc,
          bill_to_name,
          bill_to_address,
          bill_to_gstin
        ),
        property:properties(id, name, address, invoice_prefix, owner_id, workspace_id)
      `,
      )
      .eq("id", paymentId)
      .single();

    if (paymentError || !payment) {
      console.error("Error fetching payment:", paymentError);
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Payment data:", JSON.stringify(payment, null, 2));

    const tenant = payment.tenant;
    const property = payment.property;

    const authError = await authorizePropertyAccess(req, supabaseUrl, supabaseServiceKey, property?.id);
    if (authError) return authError;

    // Billing details (bank/PAN/GSTIN/corp numbers/owner split) as they stand RIGHT NOW —
    // used only to create a NEW invoice's snapshot, or to backfill an old invoice that
    // predates the snapshot columns. Never used to redraw an invoice that already has one,
    // since that would let editing a tenant retroactively change an already-issued invoice.
    const computeLiveSnapshot = async () => {
      const { data: tenantUnits } = await supabase
        .from("tenant_floor_units")
        .select("floor_units(corp_number)")
        .eq("tenant_id", payment.tenant_id);
      const corpNumbers = (tenantUnits || []).map((u: any) => u.floor_units?.corp_number).filter(Boolean);

      let ownerShares: { owner_id: string; share_percentage: number; owner_name: string }[] = [];
      if (tenant?.id) {
        const { data: shares, error: sharesError } = await supabase
          .from("tenant_owner_shares")
          .select(
            `
            owner_id,
            share_percentage,
            property_owners(name)
          `,
          )
          .eq("tenant_id", tenant.id);

        if (!sharesError && shares && shares.length > 0) {
          ownerShares = shares.map((share: any) => ({
            owner_id: share.owner_id,
            share_percentage: share.share_percentage,
            owner_name: share.property_owners?.name || "Owner",
          }));
        }
      }

      return {
        bill_from_name: tenant?.bill_from_name || "Property Owner",
        bill_from_address: tenant?.bill_from_address || property?.address || "",
        bill_from_gstin: tenant?.bill_from_gstin || "",
        bill_from_pan: tenant?.bill_from_pan || "",
        bill_from_bank_name: tenant?.bill_from_bank_name || "",
        bill_from_account_number: tenant?.bill_from_account_number || "",
        bill_from_ifsc: tenant?.bill_from_ifsc || "",
        bill_to_name: tenant?.bill_to_name || tenant?.name || "Tenant",
        bill_to_address: tenant?.bill_to_address || "",
        bill_to_gstin: tenant?.bill_to_gstin || "",
        requires_gst: tenant?.requires_gst || false,
        corp_number_text: corpNumbers.join(", "),
        owner_shares: ownerShares,
      };
    };

    // Check if an invoice already exists for this payment
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select(
        `
        id, invoice_number, invoice_date,
        bill_from_name, bill_from_address, bill_from_gstin, bill_from_pan,
        bill_from_bank_name, bill_from_account_number, bill_from_ifsc,
        bill_to_name, bill_to_address, bill_to_gstin,
        requires_gst, corp_number_text, owner_shares_snapshot
      `,
      )
      .eq("property_id", payment.property_id)
      .eq("tenant_id", payment.tenant_id)
      .eq("due_date", payment.due_date)
      .eq("amount", payment.amount)
      .single();

    let invoiceNumber: string;
    let invoiceId: string;
    // The date printed as "ISSUED" on the invoice — frozen independently of the billing
    // snapshot, same self-healing rule: use the invoice's own stored value once it has one,
    // else compute once from the payment's invoice_date (falling back to due_date for
    // payments generated before invoice_date existed) and persist it.
    let invoiceDateFinal: string;
    let snapshot: {
      bill_from_name: string;
      bill_from_address: string;
      bill_from_gstin: string;
      bill_from_pan: string;
      bill_from_bank_name: string;
      bill_from_account_number: string;
      bill_from_ifsc: string;
      bill_to_name: string;
      bill_to_address: string;
      bill_to_gstin: string;
      requires_gst: boolean;
      corp_number_text: string;
      owner_shares: { owner_id: string; share_percentage: number; owner_name: string }[];
    };

    if (existingInvoice) {
      // Use existing invoice
      invoiceNumber = existingInvoice.invoice_number;
      invoiceId = existingInvoice.id;
      console.log("Using existing invoice:", invoiceNumber);

      if (existingInvoice.bill_from_name != null) {
        // Frozen snapshot already captured when this invoice was created — use it as-is,
        // regardless of what the tenant's details say today.
        snapshot = {
          bill_from_name: existingInvoice.bill_from_name || "",
          bill_from_address: existingInvoice.bill_from_address || "",
          bill_from_gstin: existingInvoice.bill_from_gstin || "",
          bill_from_pan: existingInvoice.bill_from_pan || "",
          bill_from_bank_name: existingInvoice.bill_from_bank_name || "",
          bill_from_account_number: existingInvoice.bill_from_account_number || "",
          bill_from_ifsc: existingInvoice.bill_from_ifsc || "",
          bill_to_name: existingInvoice.bill_to_name || "",
          bill_to_address: existingInvoice.bill_to_address || "",
          bill_to_gstin: existingInvoice.bill_to_gstin || "",
          requires_gst: existingInvoice.requires_gst ?? false,
          corp_number_text: existingInvoice.corp_number_text || "",
          owner_shares: (existingInvoice.owner_shares_snapshot as any[]) || [],
        };
      } else {
        // Pre-existing invoice from before the snapshot columns existed — compute once from
        // current data and persist it, so it's frozen from this point on.
        snapshot = await computeLiveSnapshot();
        await supabase
          .from("invoices")
          .update({
            bill_from_name: snapshot.bill_from_name,
            bill_from_address: snapshot.bill_from_address,
            bill_from_gstin: snapshot.bill_from_gstin,
            bill_from_pan: snapshot.bill_from_pan,
            bill_from_bank_name: snapshot.bill_from_bank_name,
            bill_from_account_number: snapshot.bill_from_account_number,
            bill_from_ifsc: snapshot.bill_from_ifsc,
            bill_to_name: snapshot.bill_to_name,
            bill_to_address: snapshot.bill_to_address,
            bill_to_gstin: snapshot.bill_to_gstin,
            requires_gst: snapshot.requires_gst,
            corp_number_text: snapshot.corp_number_text,
            owner_shares_snapshot: snapshot.owner_shares,
          })
          .eq("id", invoiceId);
      }

      if (existingInvoice.invoice_date != null) {
        invoiceDateFinal = existingInvoice.invoice_date;
      } else {
        invoiceDateFinal = payment.invoice_date || payment.due_date;
        await supabase.from("invoices").update({ invoice_date: invoiceDateFinal }).eq("id", invoiceId);
      }
    } else {
      snapshot = await computeLiveSnapshot();
      invoiceDateFinal = payment.invoice_date || payment.due_date;

      // Never mint an invoice ahead of its scheduled invoice date — numbering must follow
      // the real issue order. IST is a fixed UTC+5:30 offset, so shifting "now" by it and
      // reading UTC fields gives today's IST calendar date.
      const istToday = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0];
      if (invoiceDateFinal > istToday) {
        return new Response(
          JSON.stringify({
            error: `This invoice is scheduled for ${invoiceDateFinal} and cannot be generated before that date.`,
            code: "invoice_not_due_yet",
            invoiceDate: invoiceDateFinal,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Prefix belongs to the billing address issuing the invoice, not the property. The
      // invoice's frozen bill_from_name is a copy (not a live FK), so resolve it by name
      // match against billing_addresses; fall back to the property's legacy prefix, then a
      // name-derived one, if no billing address (or no prefix on it) is found.
      let prefix = property?.invoice_prefix || property?.name?.substring(0, 3).toUpperCase() || "INV";
      if (snapshot.bill_from_name) {
        const { data: billingAddresses } = await supabase
          .from("billing_addresses")
          .select("invoice_prefix")
          .eq("name", snapshot.bill_from_name)
          .not("invoice_prefix", "is", null)
          .limit(1);
        if (billingAddresses?.[0]?.invoice_prefix) {
          prefix = billingAddresses[0].invoice_prefix;
        }
      }

      // Financial year (Apr 1 - Mar 31), labeled by its ending calendar year, computed from
      // the invoice's own issue date — not the payment due date.
      const invDate = new Date(invoiceDateFinal);
      const fyEndYear = invDate.getMonth() >= 3 ? invDate.getFullYear() + 1 : invDate.getFullYear();
      const yearShort = String(fyEndYear).slice(-2);

      // Get or create sequence for this prefix and financial year — shared across every
      // property billed under the same prefix, so numbering stays sequential per GST series.
      const { data: sequence, error: seqError } = await supabase
        .from("invoice_sequences")
        .select("id, last_sequence")
        .eq("prefix", prefix)
        .eq("year", fyEndYear)
        .single();

      let nextSequence: number;

      if (seqError || !sequence) {
        // Create new sequence
        const { data: newSeq, error: createSeqError } = await supabase
          .from("invoice_sequences")
          .insert({
            prefix: prefix,
            property_id: payment.property_id,
            year: fyEndYear,
            last_sequence: 1,
            // Service role bypasses the current_workspace_id() column default (which
            // resolves to NULL here), so set the workspace explicitly.
            workspace_id: payment.workspace_id || property?.workspace_id,
          })
          .select()
          .single();

        if (createSeqError) {
          console.error("Error creating sequence:", createSeqError);
          throw new Error("Failed to create invoice sequence");
        }
        nextSequence = 1;
      } else {
        // Update existing sequence
        nextSequence = sequence.last_sequence + 1;
        const { error: updateSeqError } = await supabase
          .from("invoice_sequences")
          .update({ last_sequence: nextSequence })
          .eq("id", sequence.id);

        if (updateSeqError) {
          console.error("Error updating sequence:", updateSeqError);
          throw new Error("Failed to update invoice sequence");
        }
      }

      // Format: INV-PREFIX-YY-001
      invoiceNumber = `INV-${prefix}-${yearShort}-${String(nextSequence).padStart(3, "0")}`;

      // Create invoice record - use property owner_id as created_by
      const createdBy = payment.marked_by || property?.owner_id;
      if (!createdBy) {
        console.error("No valid user ID for created_by");
        throw new Error("Cannot determine invoice creator");
      }

      // Determine the billing period for the invoice description
      let rentPeriod: string;
      if (payment.billing_month) {
        const [bY, bM] = payment.billing_month.split("-");
        const billingDate = new Date(parseInt(bY), parseInt(bM) - 1, 1);
        rentPeriod = billingDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      } else {
        rentPeriod = new Date(payment.due_date).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      }

      const { data: newInvoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          property_id: payment.property_id,
          tenant_id: payment.tenant_id,
          amount: payment.amount,
          due_date: payment.due_date,
          invoice_date: invoiceDateFinal,
          status: payment.status === "paid" ? "paid" : "sent",
          created_by: createdBy,
          workspace_id: payment.workspace_id || property?.workspace_id,
          items: JSON.stringify([{ description: `Rent for ${rentPeriod}`, amount: payment.amount }]),
          bill_from_name: snapshot.bill_from_name,
          bill_from_address: snapshot.bill_from_address,
          bill_from_gstin: snapshot.bill_from_gstin,
          bill_from_pan: snapshot.bill_from_pan,
          bill_from_bank_name: snapshot.bill_from_bank_name,
          bill_from_account_number: snapshot.bill_from_account_number,
          bill_from_ifsc: snapshot.bill_from_ifsc,
          bill_to_name: snapshot.bill_to_name,
          bill_to_address: snapshot.bill_to_address,
          bill_to_gstin: snapshot.bill_to_gstin,
          requires_gst: snapshot.requires_gst,
          corp_number_text: snapshot.corp_number_text,
          owner_shares_snapshot: snapshot.owner_shares,
        })
        .select()
        .single();

      if (invoiceError) {
        console.error("Error creating invoice:", invoiceError);
        throw new Error("Failed to create invoice record");
      }

      invoiceId = newInvoice.id;
      console.log("Created new invoice:", invoiceNumber);
    }

    const ownerShares = snapshot.owner_shares;

    // ===== PREMIUM INVOICE LAYOUT =====
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

    // Editorial palette — ink + warm gold + cream
    const ink = rgb(0.09, 0.11, 0.16);
    const muted = rgb(0.44, 0.46, 0.52);
    const rule = rgb(0.82, 0.82, 0.85);
    const accent = rgb(0.66, 0.52, 0.18);
    const cream = rgb(0.976, 0.966, 0.945);
    const paidBg = rgb(0.93, 0.97, 0.93);
    const paidBorder = rgb(0.35, 0.65, 0.35);
    const paidInk = rgb(0.16, 0.45, 0.22);

    const L = 55;
    const R = width - 55;
    const CENTER = width / 2;

    // ---- Primitives ----
    const drawText = (t: string, x: number, y: number, f = sans, s = 10, c = ink) => {
      if (t) page.drawText(t, { x, y, font: f, size: s, color: c });
    };
    const textWidth = (t: string, f = sans, s = 10) => f.widthOfTextAtSize(t || "", s);
    const rightText = (t: string, xRight: number, y: number, f = sans, s = 10, c = ink) => {
      drawText(t, xRight - textWidth(t, f, s), y, f, s, c);
    };
    const trackedWidth = (t: string, f = sansBold, s = 8, tr = 1.6) => {
      if (!t) return 0;
      let w = 0;
      for (const ch of t) w += f.widthOfTextAtSize(ch, s) + tr;
      return w - tr;
    };
    const tracked = (t: string, x: number, y: number, f = sansBold, s = 8, c = muted, tr = 1.6) => {
      let cx = x;
      const T = t.toUpperCase();
      for (const ch of T) {
        page.drawText(ch, { x: cx, y, font: f, size: s, color: c });
        cx += f.widthOfTextAtSize(ch, s) + tr;
      }
    };
    const trackedRight = (
      t: string, xRight: number, y: number, f = sansBold, s = 8, c = muted, tr = 1.6,
    ) => tracked(t, xRight - trackedWidth(t, f, s, tr), y, f, s, c, tr);
    const hLine = (x1: number, x2: number, y: number, color = rule, thickness = 0.5) =>
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
    const drawWrapped = (
      t: string, x: number, y: number, maxW: number,
      f = sans, s = 10, c = ink, lh = 13,
    ): number => {
      if (!t) return y;
      const words = t.split(/\s+/);
      let line = "";
      let cy = y;
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (textWidth(test, f, s) > maxW && line) {
          drawText(line, x, cy, f, s, c);
          cy -= lh;
          line = w;
        } else line = test;
      }
      if (line) { drawText(line, x, cy, f, s, c); cy -= lh; }
      return cy;
    };
    const labelValue = (label: string, val: string, x: number, y: number) => {
      tracked(label, x, y + 12, sansBold, 7, muted, 1.4);
      drawText(val, x, y, sans, 10, ink);
    };

    // ---- Compute values upfront ----
    const invoiceDate = new Date(invoiceDateFinal).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
    const dueDateStr = new Date(payment.due_date).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
    let periodMonth: string;
    if (payment.billing_month) {
      const [bY, bM] = payment.billing_month.split("-");
      periodMonth = new Date(parseInt(bY), parseInt(bM) - 1, 1)
        .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    } else {
      periodMonth = new Date(payment.due_date)
        .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    }
    const baseAmount = payment.amount;
    const requiresGst = snapshot.requires_gst;
    const gstAmount = requiresGst ? baseAmount * 0.18 : 0;
    const totalAmount = baseAmount + gstAmount;
    const HSN_SAC_CODE = "997212";

    // =====================================================================
    // TOP BANNER — invoice number left, dates right, hairline + gold accent
    // =====================================================================
    let y = height - 62;
    tracked(requiresGst ? "TAX INVOICE" : "INVOICE", L, y, sansBold, 9, muted, 2.8);
    drawText(invoiceNumber, L, y - 30, serifBold, 22, ink);

    trackedRight("ISSUED", R, y, sansBold, 8, muted, 2);
    rightText(invoiceDate, R, y - 14, sans, 11, ink);
    trackedRight("DUE", R, y - 32, sansBold, 8, muted, 2);
    rightText(dueDateStr, R, y - 46, sans, 11, ink);

    y = height - 130;
    page.drawRectangle({ x: L, y: y, width: 32, height: 1.8, color: accent });
    hLine(L + 42, R, y + 0.9, rule, 0.5);

    // =====================================================================
    // FROM / BILL TO — two evenly-baselined columns
    // =====================================================================
    y -= 26;
    const colW = 230;
    const rightColX = R - colW;
    tracked("From", L, y, sansBold, 8, muted, 2);
    tracked("Bill To", rightColX, y, sansBold, 8, muted, 2);
    y -= 18;

    let yl = drawWrapped(snapshot.bill_from_name || "—", L, y, colW, serifBold, 13, ink, 15);
    let yr = drawWrapped(snapshot.bill_to_name || "—", rightColX, y, colW, serifBold, 13, ink, 15);
    yl -= 2;
    yr -= 2;
    if (snapshot.bill_from_address) {
      yl = drawWrapped(snapshot.bill_from_address, L, yl, colW, sans, 9.5, muted, 12);
    }
    if (snapshot.bill_to_address) {
      yr = drawWrapped(snapshot.bill_to_address, rightColX, yr, colW, sans, 9.5, muted, 12);
    }
    const kv = (label: string, val: string, x: number, yy: number) => {
      const lw = textWidth(label + "  ", sansBold, 8.5);
      drawText(label, x, yy, sansBold, 8.5, muted);
      drawText(val, x + lw, yy, sans, 9.5, ink);
    };
    if (snapshot.bill_from_gstin) { kv("GSTIN", snapshot.bill_from_gstin, L, yl - 2); yl -= 13; }
    if (snapshot.bill_from_pan) { kv("PAN", snapshot.bill_from_pan, L, yl - 2); yl -= 13; }
    if (snapshot.bill_to_gstin) { kv("GSTIN", snapshot.bill_to_gstin, rightColX, yr - 2); yr -= 13; }

    y = Math.min(yl, yr) - 22;

    // =====================================================================
    // PROPERTY + BILLING PERIOD row
    // =====================================================================
    hLine(L, R, y);
    y -= 20;
    tracked("Property", L, y, sansBold, 8, muted, 2);
    tracked("Billing Period", rightColX, y, sansBold, 8, muted, 2);
    y -= 15;
    drawText(property?.name || "N/A", L, y, serifBold, 12, ink);
    drawText(periodMonth, rightColX, y, serifBold, 12, ink);
    y -= 13;
    const addrParts = [
      property?.address,
      snapshot.corp_number_text ? `Corp ${snapshot.corp_number_text}` : null,
    ].filter(Boolean);
    if (addrParts.length) drawText(addrParts.join(" · "), L, y, sans, 9, muted);
    y -= 26;

    // =====================================================================
    // LINE ITEMS TABLE — hairline top/bottom, right-aligned amounts
    // =====================================================================
    const hsnX = 360;
    hLine(L, R, y);
    y -= 14;
    tracked("Description", L, y, sansBold, 7.5, muted, 1.8);
    tracked("HSN / SAC", hsnX, y, sansBold, 7.5, muted, 1.8);
    trackedRight("Amount (INR)", R, y, sansBold, 7.5, muted, 1.8);
    y -= 10;
    hLine(L, R, y);
    y -= 20;

    const drawItemRow = (title: string, sub: string, amount: number) => {
      drawText(title, L, y, sans, 10.5, ink);
      drawText(sub, L, y - 12, sans, 9, muted);
      drawText(HSN_SAC_CODE, hsnX, y, sans, 10, ink);
      rightText(formatCurrency(amount), R, y, sans, 10.5, ink);
      y -= 32;
    };

    if (snapshot.owner_shares.length > 1) {
      for (const share of snapshot.owner_shares) {
        const amt = baseAmount * (share.share_percentage / 100);
        drawItemRow(
          "Renting of Immovable Property",
          `${periodMonth} · ${share.owner_name} (${share.share_percentage}%)`,
          amt,
        );
      }
    } else {
      drawItemRow(
        "Renting of Immovable Property",
        `For the month of ${periodMonth}`,
        baseAmount,
      );
    }

    hLine(L, R, y + 8, rule, 0.4);
    y -= 4;

    // =====================================================================
    // TOTALS PANEL (right-aligned)
    // =====================================================================
    const totalsX = 330;
    const rowLine = (label: string, val: string) => {
      drawText(label, totalsX, y, sans, 10, muted);
      rightText(val, R, y, sans, 10.5, ink);
      y -= 16;
    };
    if (requiresGst) {
      rowLine("Subtotal", formatCurrency(baseAmount));
      rowLine("CGST @ 9%", formatCurrency(gstAmount / 2));
      rowLine("SGST @ 9%", formatCurrency(gstAmount / 2));
      hLine(totalsX, R, y + 6, rule, 0.4);
      y -= 4;
    }
    drawText("TOTAL", totalsX, y, sansBold, 10.5, ink);
    rightText(formatCurrency(totalAmount), R, y - 2, serifBold, 16, ink);
    y -= 10;
    page.drawRectangle({ x: totalsX, y: y - 2, width: R - totalsX, height: 1.5, color: accent });
    y -= 22;

    // Amount in words (italic serif, muted)
    const amountInWords = numberToWords(Math.round(totalAmount));
    drawText(
      `Amount in words: ${amountInWords} Rupees Only`,
      L, y, serifItalic, 10, muted,
    );
    y -= 28;

    // =====================================================================
    // BANK DETAILS CARD
    // =====================================================================
    const bankName = snapshot.bill_from_bank_name;
    const bankAcc = snapshot.bill_from_account_number;
    const bankIfsc = snapshot.bill_from_ifsc;
    if (bankName || bankAcc || bankIfsc) {
      const cardH = 68;
      const cardY = y - cardH + 14;
      page.drawRectangle({
        x: L, y: cardY, width: R - L, height: cardH,
        color: cream, borderColor: rule, borderWidth: 0.5,
      });
      page.drawRectangle({ x: L, y: cardY, width: 3, height: cardH, color: accent });
      tracked("Bank Details for Payment", L + 18, y, sansBold, 8, muted, 2);
      const col1 = L + 18, col2 = L + 210, col3 = L + 380;
      const bY = y - 30;
      if (bankName) labelValue("Bank", bankName, col1, bY);
      if (bankAcc) labelValue("Account No.", bankAcc, col2, bY);
      if (bankIfsc) labelValue("IFSC", bankIfsc, col3, bY);
      y = cardY - 22;
    }

    // =====================================================================
    // PAID stamp — outlined pill on the right, elegant
    // =====================================================================
    if (payment.status === "paid") {
      const paidDate = payment.paid_date
        ? new Date(payment.paid_date).toLocaleDateString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
          })
        : "";
      const stampW = 165, stampH = 46;
      const sx = R - stampW, sy = y - stampH + 14;
      page.drawRectangle({
        x: sx, y: sy, width: stampW, height: stampH,
        color: paidBg, borderColor: paidBorder, borderWidth: 1.2,
      });
      drawText("PAID", sx + 14, sy + stampH - 22, serifBold, 18, paidInk);
      if (paidDate) drawText(`on ${paidDate}`, sx + 62, sy + stampH - 20, sans, 9.5, paidInk);
      if (payment.payment_method) {
        drawText(`via ${payment.payment_method}`, sx + 14, sy + 10, sans, 9, paidInk);
      }
    }

    // =====================================================================
    // FOOTER — thin rule + tracked signature notice
    // =====================================================================
    const footerY = 70;
    hLine(L, R, footerY, rule, 0.4);
    page.drawRectangle({ x: L, y: footerY - 0.5, width: 32, height: 1.5, color: accent });
    drawText("Thank you for your business.", L, footerY - 18, serifItalic, 10, muted);
    trackedRight(
      "Computer-generated invoice · No signature required",
      R, footerY - 18, sansBold, 7, muted, 1.4,
    );

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

    console.log("PDF generated successfully");

    return new Response(
      JSON.stringify({
        pdf: base64Pdf,
        filename: `Invoice-${invoiceNumber}.pdf`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: any) {
    console.error("Error generating invoice:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

// Helper function to format currency (using Rs. instead of ₹ for PDF font compatibility)
function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `Rs. ${formatted}`;
}

// Helper function to convert number to words (Indian numbering system)
function numberToWords(num: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (num === 0) return "Zero";
  if (num < 0) return "Minus " + numberToWords(-num);

  let words = "";

  if (Math.floor(num / 10000000) > 0) {
    words += numberToWords(Math.floor(num / 10000000)) + " Crore ";
    num %= 10000000;
  }

  if (Math.floor(num / 100000) > 0) {
    words += numberToWords(Math.floor(num / 100000)) + " Lakh ";
    num %= 100000;
  }

  if (Math.floor(num / 1000) > 0) {
    words += numberToWords(Math.floor(num / 1000)) + " Thousand ";
    num %= 1000;
  }

  if (Math.floor(num / 100) > 0) {
    words += ones[Math.floor(num / 100)] + " Hundred ";
    num %= 100;
  }

  if (num > 0) {
    if (num < 20) {
      words += ones[num];
    } else {
      words += tens[Math.floor(num / 10)];
      if (num % 10 > 0) {
        words += " " + ones[num % 10];
      }
    }
  }

  return words.trim();
}
