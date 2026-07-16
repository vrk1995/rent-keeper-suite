import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Txn {
  id: string;
  amount: number;
  tds_amount: number;
  received_amount: number;
  paid_date: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // transactionId => receipt for one installment; statement => full ledger for the rent;
    // neither => legacy single receipt for the whole (fully-paid) payment.
    const { paymentId, transactionId, statement } = await req.json();

    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: "Payment ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch payment with tenant and property details
    const { data: payment, error: paymentError } = await supabase
      .from("rent_payments")
      .select(`
        *,
        tenant:tenants(
          id, name, email, phone,
          requires_gst,
          bill_from_name, bill_from_address, bill_from_gstin,
          bill_to_name, bill_to_address, bill_to_gstin
        ),
        property:properties(id, name, address, invoice_prefix, owner_id)
      `)
      .eq("id", paymentId)
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // A single legacy receipt only makes sense once fully paid. Installment receipts and
    // statements are valid for partial payments too.
    if (!transactionId && !statement && payment.status !== "paid") {
      return new Response(
        JSON.stringify({ error: "Payment is not marked as paid" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const tenant = payment.tenant;
    const property = payment.property;

    // All installments recorded against this rent, oldest first.
    const { data: txnRows } = await supabase
      .from("payment_transactions")
      .select("id, amount, tds_amount, received_amount, paid_date, payment_method, notes, created_at")
      .eq("rent_payment_id", paymentId)
      .order("paid_date", { ascending: true })
      .order("created_at", { ascending: true });
    const transactions: Txn[] = (txnRows as Txn[]) || [];

    const prefix = property?.invoice_prefix || property?.name?.substring(0, 3).toUpperCase() || "REC";
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);

    // Rent period label
    let periodMonth: string;
    if (payment.billing_month) {
      const [bY, bM] = payment.billing_month.split("-");
      periodMonth = new Date(parseInt(bY), parseInt(bM) - 1, 1)
        .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    } else {
      periodMonth = new Date(payment.due_date)
        .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    }

    const totalDue = Number(payment.amount) || 0;
    const totalReceivedGross = transactions.reduce((s, t) => s + Number(t.amount), 0);

    // === Build PDF ===
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const primaryColor = rgb(0.13, 0.55, 0.13); // Green theme for receipt
    const blackColor = rgb(0, 0, 0);
    const grayColor = rgb(0.4, 0.4, 0.4);
    const lightGrayColor = rgb(0.93, 0.93, 0.93);
    const greenBg = rgb(0.9, 1, 0.9);

    let yPos = height - 50;
    const leftMargin = 50;
    const rightMargin = width - 50;

    const drawText = (text: string, x: number, y: number, font = fontRegular, size = 10, color = blackColor) => {
      page.drawText(text, { x, y, font, size, color });
    };
    const drawLine = (x1: number, y1: number, x2: number, y2: number, thickness = 1) => {
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: grayColor });
    };
    const drawWrappedText = (text: string, x: number, y: number, maxWidth: number, font = fontRegular, size = 10, color = blackColor, lineHeight = 14): number => {
      if (!text) return y;
      const words = text.split(" ");
      let line = "";
      let currentY = y;
      for (const word of words) {
        const testLine = line + (line ? " " : "") + word;
        if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
          drawText(line, x, currentY, font, size, color);
          currentY -= lineHeight;
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) {
        drawText(line, x, currentY, font, size, color);
        currentY -= lineHeight;
      }
      return currentY;
    };

    const isStatement = !!statement;
    const docTitle = isStatement ? "PAYMENT STATEMENT" : "PAYMENT RECEIPT";
    const docNumber = isStatement
      ? `STMT-${prefix}-${String(new Date().getFullYear()).slice(-2)}-${timestamp}`
      : `REC-${prefix}-${String(new Date().getFullYear()).slice(-2)}-${timestamp}`;

    // Header date: for an installment receipt, use that installment's date; else today.
    const thisTxn = transactionId ? transactions.find((t) => t.id === transactionId) : null;
    const headerDate = thisTxn ? new Date(thisTxn.paid_date) : new Date();

    // === HEADER ===
    drawText(docTitle, leftMargin, yPos, fontBold, 24, primaryColor);
    drawText(`No: ${docNumber}`, rightMargin - 170, yPos, fontBold, 10);
    drawText(
      `Date: ${headerDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
      rightMargin - 170, yPos - 15, fontRegular, 10, grayColor
    );

    yPos -= 50;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 30;

    // === RECEIVED FROM (Owner/Landlord) ===
    drawText("RECEIVED FROM", leftMargin, yPos, fontBold, 11, primaryColor);
    yPos -= 18;
    const receivedFromName = tenant?.bill_from_name || "Property Owner";
    const receivedFromAddress = tenant?.bill_from_address || property?.address || "";
    yPos = drawWrappedText(receivedFromName, leftMargin, yPos, 220, fontBold, 11, blackColor, 14);
    yPos -= 3;
    if (receivedFromAddress) {
      yPos = drawWrappedText(receivedFromAddress, leftMargin, yPos, 220, fontRegular, 10, grayColor, 12);
    }

    // === ISSUED TO (Tenant) ===
    let issuedToY = height - 50 - 50 - 30 - 18;
    drawText("ISSUED TO", rightMargin - 200, issuedToY, fontBold, 11, primaryColor);
    issuedToY -= 18;
    const issuedToName = tenant?.bill_to_name || tenant?.name || "Tenant";
    const issuedToAddress = tenant?.bill_to_address || "";
    issuedToY = drawWrappedText(issuedToName, rightMargin - 200, issuedToY, 200, fontBold, 11, blackColor, 14);
    issuedToY -= 3;
    if (issuedToAddress) {
      issuedToY = drawWrappedText(issuedToAddress, rightMargin - 200, issuedToY, 200, fontRegular, 10, grayColor, 12);
    }

    yPos = Math.min(yPos, issuedToY) - 30;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 25;

    // === PROPERTY + PERIOD ===
    drawText("PROPERTY", leftMargin, yPos, fontBold, 11, primaryColor);
    yPos -= 16;
    drawText(`${property?.name || "N/A"}`, leftMargin, yPos, fontRegular, 10);
    yPos -= 12;
    drawText(`${property?.address || ""}`, leftMargin, yPos, fontRegular, 10, grayColor);
    yPos -= 12;
    drawText(`Rent for: ${periodMonth}`, leftMargin, yPos, fontRegular, 10, grayColor);
    yPos -= 25;

    if (isStatement) {
      // === STATEMENT: table of every installment with a running balance ===
      const cols = { date: leftMargin + 6, method: leftMargin + 130, amount: leftMargin + 250, tds: leftMargin + 340, bal: leftMargin + 430 };
      page.drawRectangle({ x: leftMargin, y: yPos - 5, width: rightMargin - leftMargin, height: 22, color: lightGrayColor });
      const headY = yPos + 2;
      drawText("Date", cols.date, headY, fontBold, 9);
      drawText("Method", cols.method, headY, fontBold, 9);
      drawText("Amount", cols.amount, headY, fontBold, 9);
      drawText("TDS", cols.tds, headY, fontBold, 9);
      drawText("Balance", cols.bal, headY, fontBold, 9);
      yPos -= 22;

      let running = 0;
      for (const t of transactions) {
        running += Number(t.amount);
        const bal = totalDue - running;
        const methodLabel = t.payment_method
          ? t.payment_method.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
          : "-";
        drawText(new Date(t.paid_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }), cols.date, yPos, fontRegular, 9);
        drawText(methodLabel.length > 16 ? methodLabel.slice(0, 15) + "." : methodLabel, cols.method, yPos, fontRegular, 9);
        drawText(formatCurrency(Number(t.amount)), cols.amount, yPos, fontRegular, 9);
        drawText(Number(t.tds_amount) > 0 ? formatCurrency(Number(t.tds_amount)) : "-", cols.tds, yPos, fontRegular, 9, grayColor);
        drawText(formatCurrency(bal), cols.bal, yPos, fontRegular, 9);
        yPos -= 18;
      }

      yPos -= 4;
      drawLine(leftMargin, yPos, rightMargin, yPos);
      yPos -= 22;
      drawText("Total Rent Due", leftMargin + 6, yPos, fontRegular, 10, grayColor);
      drawText(formatCurrency(totalDue), cols.bal, yPos, fontRegular, 10);
      yPos -= 16;
      drawText("Total Received", leftMargin + 6, yPos, fontRegular, 10, grayColor);
      drawText(formatCurrency(totalReceivedGross), cols.bal, yPos, fontRegular, 10, primaryColor);
      yPos -= 20;
      const balance = totalDue - totalReceivedGross;
      drawText(balance <= 0 ? "FULLY PAID" : "BALANCE DUE", leftMargin + 6, yPos, fontBold, 12, balance <= 0 ? primaryColor : rgb(0.8, 0.3, 0.1));
      drawText(formatCurrency(Math.max(0, balance)), leftMargin + 350, yPos, fontBold, 12, balance <= 0 ? primaryColor : rgb(0.8, 0.3, 0.1));
    } else {
      // === RECEIPT: one payment (a specific installment, or the whole payment legacy) ===
      const gross = thisTxn ? Number(thisTxn.amount) : Number(payment.paid_amount) || 0;
      const tds = thisTxn ? Number(thisTxn.tds_amount) : (payment.tds_applicable ? Number(payment.tds_amount) || 0 : 0);
      const net = thisTxn ? Number(thisTxn.received_amount) : gross - tds;
      const method = thisTxn ? thisTxn.payment_method : payment.payment_method;
      const notes = thisTxn ? thisTxn.notes : payment.notes;

      // How much had been received up to and including this installment.
      let receivedUpToThis = totalReceivedGross;
      if (thisTxn) {
        receivedUpToThis = 0;
        for (const t of transactions) {
          receivedUpToThis += Number(t.amount);
          if (t.id === thisTxn.id) break;
        }
      }
      const balanceAfter = totalDue - receivedUpToThis;

      // Details table
      page.drawRectangle({ x: leftMargin, y: yPos - 5, width: rightMargin - leftMargin, height: 22, color: lightGrayColor });
      drawText("Description", leftMargin + 10, yPos + 2, fontBold, 10);
      drawText("Amount (INR)", leftMargin + 360, yPos + 2, fontBold, 10);
      yPos -= 26;

      drawText(`Rent for ${periodMonth} (total)`, leftMargin + 10, yPos, fontRegular, 10);
      drawText(formatCurrency(totalDue), leftMargin + 360, yPos, fontRegular, 10, grayColor);
      yPos -= 20;

      drawText("Amount received (this payment)", leftMargin + 10, yPos, fontRegular, 10);
      drawText(formatCurrency(gross), leftMargin + 360, yPos, fontRegular, 10);
      yPos -= 18;

      if (tds > 0) {
        drawText("Less: TDS Deducted @ 10%", leftMargin + 10, yPos, fontRegular, 10, grayColor);
        drawText(`- ${formatCurrency(tds)}`, leftMargin + 360, yPos, fontRegular, 10, grayColor);
        yPos -= 18;
      }

      yPos -= 6;
      drawLine(leftMargin, yPos, rightMargin, yPos);
      yPos -= 24;

      drawText(tds > 0 ? "NET RECEIVED" : "AMOUNT RECEIVED", leftMargin + 10, yPos, fontBold, 12);
      drawText(formatCurrency(net), leftMargin + 350, yPos, fontBold, 14, primaryColor);
      yPos -= 20;

      const amountInWords = numberToWords(Math.round(net));
      drawText(`Amount in words: ${amountInWords} Rupees Only`, leftMargin, yPos, fontRegular, 9, grayColor);
      yPos -= 30;

      // Running summary
      drawText(`Total received so far: ${formatCurrency(receivedUpToThis)}`, leftMargin, yPos, fontRegular, 10, grayColor);
      yPos -= 14;
      drawText(
        balanceAfter <= 0 ? "Balance: Nil (Fully Paid)" : `Balance remaining: ${formatCurrency(balanceAfter)}`,
        leftMargin, yPos, fontBold, 10, balanceAfter <= 0 ? primaryColor : rgb(0.8, 0.3, 0.1)
      );
      yPos -= 28;

      // Payment confirmation box
      page.drawRectangle({
        x: leftMargin, y: yPos - 15, width: rightMargin - leftMargin, height: 55,
        color: greenBg, borderColor: primaryColor, borderWidth: 1,
      });
      drawText("PAYMENT RECEIVED", leftMargin + 15, yPos + 18, fontBold, 14, primaryColor);
      drawText(
        `Date: ${headerDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
        leftMargin + 15, yPos, fontRegular, 10, grayColor
      );
      if (method) {
        const methodLabel = method.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        drawText(`Method: ${methodLabel}`, leftMargin + 200, yPos, fontRegular, 10, grayColor);
      }
      if (notes) {
        drawText(`Notes: ${notes}`, leftMargin + 15, yPos - 16, fontRegular, 9, grayColor);
      }
    }

    // === FOOTER ===
    yPos = 80;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 20;
    drawText(
      isStatement
        ? "This statement summarises all payments received against the above rent."
        : "This receipt confirms that the above payment has been received.",
      leftMargin, yPos, fontRegular, 10, grayColor
    );
    const footer = isStatement
      ? "This is a computer-generated statement and does not require a signature."
      : "This is a computer-generated receipt and does not require a signature.";
    const fw = fontRegular.widthOfTextAtSize(footer, 8);
    drawText(footer, (width - fw) / 2, yPos - 15, fontRegular, 8, grayColor);

    const pdfBytes = await pdfDoc.save();
    const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

    return new Response(
      JSON.stringify({
        pdf: base64Pdf,
        filename: `${isStatement ? "Statement" : "Receipt"}-${docNumber}.pdf`,
        receiptNumber: docNumber,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error generating receipt:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `Rs. ${formatted}`;
}

function numberToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
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
      if (num % 10 > 0) words += " " + ones[num % 10];
    }
  }
  return words.trim();
}
