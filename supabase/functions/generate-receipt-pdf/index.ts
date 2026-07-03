import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { paymentId } = await req.json();

    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: "Payment ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Generating receipt for payment:", paymentId);

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
      console.error("Error fetching payment:", paymentError);
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (payment.status !== "paid") {
      return new Response(
        JSON.stringify({ error: "Payment is not marked as paid" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const tenant = payment.tenant;
    const property = payment.property;

    // Generate receipt number
    const paidDate = new Date(payment.paid_date || new Date());
    const yearShort = String(paidDate.getFullYear()).slice(-2);
    const prefix = property?.invoice_prefix || property?.name?.substring(0, 3).toUpperCase() || "REC";
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
    const receiptNumber = `REC-${prefix}-${yearShort}-${timestamp}`;

    // Fetch tenant owner shares
    let ownerShares: { owner_id: string; share_percentage: number; owner_name: string }[] = [];
    if (tenant?.id) {
      const { data: shares } = await supabase
        .from("tenant_owner_shares")
        .select(`owner_id, share_percentage, property_owners(name)`)
        .eq("tenant_id", tenant.id);

      if (shares && shares.length > 0) {
        ownerShares = shares.map((s: any) => ({
          owner_id: s.owner_id,
          share_percentage: s.share_percentage,
          owner_name: s.property_owners?.name || "Owner",
        }));
      }
    }

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

    // === HEADER ===
    drawText("PAYMENT RECEIPT", leftMargin, yPos, fontBold, 24, primaryColor);

    const receiptDate = paidDate.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
    drawText(`Receipt No: ${receiptNumber}`, rightMargin - 160, yPos, fontBold, 10);
    drawText(`Date: ${receiptDate}`, rightMargin - 160, yPos - 15, fontRegular, 10, grayColor);

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

    yPos = Math.min(yPos, issuedToY) - 40;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 30;

    // === PROPERTY ===
    drawText("PROPERTY", leftMargin, yPos, fontBold, 11, primaryColor);
    yPos -= 18;
    drawText(`${property?.name || "N/A"}`, leftMargin, yPos, fontRegular, 10);
    yPos -= 12;
    drawText(`${property?.address || ""}`, leftMargin, yPos, fontRegular, 10, grayColor);
    yPos -= 30;

    // === PAYMENT DETAILS TABLE ===
    const tableTop = yPos;
    page.drawRectangle({
      x: leftMargin, y: tableTop - 20,
      width: rightMargin - leftMargin, height: 25,
      color: lightGrayColor,
    });
    drawText("Description", leftMargin + 10, tableTop - 13, fontBold, 10);
    drawText("Amount (INR)", leftMargin + 360, tableTop - 13, fontBold, 10);

    yPos = tableTop - 35;

    // Period
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
    const requiresGst = tenant?.requires_gst || false;
    const gstAmount = requiresGst ? baseAmount * 0.18 : 0;
    const tdsApplicable = payment.tds_applicable || false;
    const tdsAmount = tdsApplicable ? (payment.tds_amount || 0) : 0;
    const totalAmount = baseAmount + gstAmount - tdsAmount;

    // Line items
    if (ownerShares.length > 1) {
      for (const share of ownerShares) {
        const ownerAmount = baseAmount * (share.share_percentage / 100);
        drawText(`Rent for ${periodMonth} - ${share.owner_name} (${share.share_percentage}%)`, leftMargin + 10, yPos, fontRegular, 10);
        drawText(formatCurrency(ownerAmount), leftMargin + 360, yPos, fontRegular, 10);
        yPos -= 20;
      }
    } else {
      drawText(`Rent for ${periodMonth}`, leftMargin + 10, yPos, fontRegular, 10);
      drawText(formatCurrency(baseAmount), leftMargin + 360, yPos, fontRegular, 10);
      yPos -= 20;
    }

    if (requiresGst) {
      drawText("CGST @ 9%", leftMargin + 10, yPos, fontRegular, 10, grayColor);
      drawText(formatCurrency(gstAmount / 2), leftMargin + 360, yPos, fontRegular, 10);
      yPos -= 18;
      drawText("SGST @ 9%", leftMargin + 10, yPos, fontRegular, 10, grayColor);
      drawText(formatCurrency(gstAmount / 2), leftMargin + 360, yPos, fontRegular, 10);
      yPos -= 18;
    }

    if (tdsApplicable) {
      drawText("Less: TDS Deducted @ 10%", leftMargin + 10, yPos, fontRegular, 10, grayColor);
      drawText(`- ${formatCurrency(tdsAmount)}`, leftMargin + 360, yPos, fontRegular, 10, grayColor);
      yPos -= 18;
    }

    yPos -= 10;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 25;

    // TOTAL RECEIVED
    drawText("TOTAL RECEIVED", leftMargin + 10, yPos, fontBold, 12);
    drawText(formatCurrency(totalAmount), leftMargin + 350, yPos, fontBold, 14, primaryColor);
    yPos -= 20;

    // Amount in words
    const amountInWords = numberToWords(Math.round(totalAmount));
    drawText(`Amount in words: ${amountInWords} Rupees Only`, leftMargin, yPos, fontRegular, 9, grayColor);
    yPos -= 40;

    // === PAYMENT CONFIRMATION BOX ===
    page.drawRectangle({
      x: leftMargin, y: yPos - 15,
      width: rightMargin - leftMargin, height: 55,
      color: greenBg,
      borderColor: primaryColor,
      borderWidth: 1,
    });

    drawText("PAYMENT RECEIVED", leftMargin + 15, yPos + 18, fontBold, 14, primaryColor);

    const paidDateStr = paidDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    drawText(`Date: ${paidDateStr}`, leftMargin + 15, yPos, fontRegular, 10, grayColor);

    if (payment.payment_method) {
      const methodLabel = payment.payment_method.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      drawText(`Method: ${methodLabel}`, leftMargin + 200, yPos, fontRegular, 10, grayColor);
    }

    if (payment.notes) {
      drawText(`Notes: ${payment.notes}`, leftMargin + 15, yPos - 16, fontRegular, 9, grayColor);
    }

    // === FOOTER ===
    yPos = 80;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 20;
    drawText("This receipt confirms that the above payment has been received.", leftMargin, yPos, fontRegular, 10, grayColor);
    drawText("This is a computer-generated receipt.", width / 2 - 80, yPos - 15, fontRegular, 8, grayColor);

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

    console.log("Receipt PDF generated successfully");

    return new Response(
      JSON.stringify({
        pdf: base64Pdf,
        filename: `Receipt-${receiptNumber}.pdf`,
        receiptNumber,
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
