import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

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
      return new Response(
        JSON.stringify({ error: "Payment ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Generating invoice for payment:", paymentId);

    // Fetch payment with tenant and property details (including invoice_prefix and owner_id)
    const { data: payment, error: paymentError } = await supabase
      .from("rent_payments")
      .select(`
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
          bill_to_name,
          bill_to_address,
          bill_to_gstin
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

    console.log("Payment data:", JSON.stringify(payment, null, 2));

    const tenant = payment.tenant;
    const property = payment.property;

    // Check if an invoice already exists for this payment
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("property_id", payment.property_id)
      .eq("tenant_id", payment.tenant_id)
      .eq("due_date", payment.due_date)
      .eq("amount", payment.amount)
      .single();

    let invoiceNumber: string;
    let invoiceId: string;

    if (existingInvoice) {
      // Use existing invoice
      invoiceNumber = existingInvoice.invoice_number;
      invoiceId = existingInvoice.id;
      console.log("Using existing invoice:", invoiceNumber);
    } else {
      // Generate new invoice number with property prefix
      const dueDate = new Date(payment.due_date);
      const year = dueDate.getFullYear();
      const yearShort = String(year).slice(-2);
      const prefix = property?.invoice_prefix || property?.name?.substring(0, 3).toUpperCase() || "INV";

      // Get or create sequence for this property and year
      const { data: sequence, error: seqError } = await supabase
        .from("invoice_sequences")
        .select("id, last_sequence")
        .eq("property_id", payment.property_id)
        .eq("year", year)
        .single();

      let nextSequence: number;

      if (seqError || !sequence) {
        // Create new sequence
        const { data: newSeq, error: createSeqError } = await supabase
          .from("invoice_sequences")
          .insert({
            property_id: payment.property_id,
            year: year,
            last_sequence: 1,
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

      const { data: newInvoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          property_id: payment.property_id,
          tenant_id: payment.tenant_id,
          amount: payment.amount,
          due_date: payment.due_date,
          status: payment.status === "paid" ? "paid" : "sent",
          created_by: createdBy,
          items: JSON.stringify([{ description: `Rent for ${new Date(payment.due_date).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`, amount: payment.amount }]),
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

    // Fetch tenant owner shares if tenant has multiple owners
    let ownerShares: { owner_id: string; share_percentage: number; owner_name: string }[] = [];
    if (tenant?.id) {
      const { data: shares, error: sharesError } = await supabase
        .from("tenant_owner_shares")
        .select(`
          owner_id,
          share_percentage,
          property_owners(name)
        `)
        .eq("tenant_id", tenant.id);

      if (!sharesError && shares && shares.length > 0) {
        ownerShares = shares.map((share: any) => ({
          owner_id: share.owner_id,
          share_percentage: share.share_percentage,
          owner_name: share.property_owners?.name || "Owner",
        }));
        console.log("Tenant owner shares:", JSON.stringify(ownerShares, null, 2));
      }
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const primaryColor = rgb(0.2, 0.4, 0.8);
    const blackColor = rgb(0, 0, 0);
    const grayColor = rgb(0.4, 0.4, 0.4);
    const lightGrayColor = rgb(0.9, 0.9, 0.9);

    let yPos = height - 50;
    const leftMargin = 50;
    const rightMargin = width - 50;

    // Helper function to draw text
    const drawText = (text: string, x: number, y: number, font = fontRegular, size = 10, color = blackColor) => {
      page.drawText(text, { x, y, font, size, color });
    };

    // Helper function to draw a line
    const drawLine = (x1: number, y1: number, x2: number, y2: number, thickness = 1) => {
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: grayColor });
    };

    // Helper function to draw wrapped text and return the new Y position
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

    // HEADER - INVOICE title (TAX INVOICE if GST applicable, otherwise just INVOICE)
    const invoiceTitle = tenant?.requires_gst ? "TAX INVOICE" : "INVOICE";
    drawText(invoiceTitle, leftMargin, yPos, fontBold, 24, primaryColor);
    
    // Invoice number and date on the right (invoiceNumber was already set above)
    const invoiceDate = new Date(payment.paid_date || payment.due_date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    drawText(`Invoice No: ${invoiceNumber}`, rightMargin - 150, yPos, fontBold, 10);
    drawText(`Date: ${invoiceDate}`, rightMargin - 150, yPos - 15, fontRegular, 10, grayColor);

    yPos -= 50;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 30;

    // BILL FROM section
    drawText("BILL FROM", leftMargin, yPos, fontBold, 11, primaryColor);
    yPos -= 18;

    const billFromName = tenant?.bill_from_name || "Property Owner";
    const billFromAddress = tenant?.bill_from_address || property?.address || "";
    const billFromGstin = tenant?.bill_from_gstin || "";
    const maxWidthLeft = 220;
    const maxWidthRight = 200;

    // Draw Bill From Name with wrapping
    yPos = drawWrappedText(billFromName, leftMargin, yPos, maxWidthLeft, fontBold, 11, blackColor, 14);
    yPos -= 3;
    
    // Draw Bill From Address with wrapping
    if (billFromAddress) {
      yPos = drawWrappedText(billFromAddress, leftMargin, yPos, maxWidthLeft, fontRegular, 10, grayColor, 12);
    }
    
    if (billFromGstin) {
      drawText(`GSTIN: ${billFromGstin}`, leftMargin, yPos, fontRegular, 10, grayColor);
      yPos -= 12;
    }

    // BILL TO section (on the right) - calculate starting Y position
    // Start Bill To at the same level as Bill From started
    let billToYPos = height - 50 - 50 - 30 - 18;
    
    drawText("BILL TO", rightMargin - 200, billToYPos, fontBold, 11, primaryColor);
    billToYPos -= 18;

    const billToName = tenant?.bill_to_name || tenant?.name || "Tenant";
    const billToAddress = tenant?.bill_to_address || "";
    const billToGstin = tenant?.bill_to_gstin || "";

    // Draw Bill To Name with wrapping
    billToYPos = drawWrappedText(billToName, rightMargin - 200, billToYPos, maxWidthRight, fontBold, 11, blackColor, 14);
    billToYPos -= 3;

    // Draw Bill To Address with wrapping
    if (billToAddress) {
      billToYPos = drawWrappedText(billToAddress, rightMargin - 200, billToYPos, maxWidthRight, fontRegular, 10, grayColor, 12);
    }

    if (billToGstin) {
      drawText(`GSTIN: ${billToGstin}`, rightMargin - 200, billToYPos, fontRegular, 10, grayColor);
      billToYPos -= 12;
    }

    yPos = Math.min(yPos, billToYPos) - 40;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 30;

    // Property Details
    drawText("PROPERTY DETAILS", leftMargin, yPos, fontBold, 11, primaryColor);
    yPos -= 18;
    drawText(`Property: ${property?.name || "N/A"}`, leftMargin, yPos, fontRegular, 10);
    yPos -= 12;
    drawText(`Address: ${property?.address || "N/A"}`, leftMargin, yPos, fontRegular, 10, grayColor);
    yPos -= 25;

    // Invoice Items Table
    const tableTop = yPos;
    const tableHeaders = ["Description", "Amount (INR)"];
    const colWidths = [350, 145];
    
    // Draw table header background
    page.drawRectangle({
      x: leftMargin,
      y: tableTop - 20,
      width: rightMargin - leftMargin,
      height: 25,
      color: lightGrayColor,
    });

    // Draw table headers
    let xPos = leftMargin + 10;
    for (let i = 0; i < tableHeaders.length; i++) {
      drawText(tableHeaders[i], xPos, tableTop - 13, fontBold, 10);
      xPos += colWidths[i];
    }

    yPos = tableTop - 35;

    // Calculate amounts
    const baseAmount = payment.amount;
    const requiresGst = tenant?.requires_gst || false;
    const gstRate = 0.18; // 18% GST
    const gstAmount = requiresGst ? baseAmount * gstRate : 0;
    const totalAmount = baseAmount + gstAmount;

    // Period
    const dueDate = new Date(payment.due_date);
    const periodMonth = dueDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

    // Draw items - split by owner if multiple owners exist
    if (ownerShares.length > 1) {
      // Multiple owners - show individual line items for each owner
      for (const share of ownerShares) {
        const ownerAmount = baseAmount * (share.share_percentage / 100);
        drawText(`Rent for ${periodMonth} - ${share.owner_name} (${share.share_percentage}%)`, leftMargin + 10, yPos, fontRegular, 10);
        drawText(formatCurrency(ownerAmount), leftMargin + 360, yPos, fontRegular, 10);
        yPos -= 20;
      }
    } else {
      // Single owner or no owner shares - show single line item
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

    yPos -= 10;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 20;

    // Total
    drawText("TOTAL", leftMargin + 10, yPos, fontBold, 12);
    drawText(formatCurrency(totalAmount), leftMargin + 350, yPos, fontBold, 14, primaryColor);
    yPos -= 30;

    // Amount in words
    const amountInWords = numberToWords(Math.round(totalAmount));
    drawText(`Amount in words: ${amountInWords} Rupees Only`, leftMargin, yPos, fontRegular, 9, grayColor);
    yPos -= 40;

    // Payment Status
    if (payment.status === "paid") {
      const paidDate = payment.paid_date 
        ? new Date(payment.paid_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "";
      
      page.drawRectangle({
        x: leftMargin,
        y: yPos - 10,
        width: 150,
        height: 30,
        color: rgb(0.9, 1, 0.9),
        borderColor: rgb(0.2, 0.7, 0.2),
        borderWidth: 1,
      });
      
      drawText("✓ PAID", leftMargin + 10, yPos, fontBold, 14, rgb(0.2, 0.6, 0.2));
      if (paidDate) {
        drawText(`on ${paidDate}`, leftMargin + 60, yPos, fontRegular, 10, grayColor);
      }
      if (payment.payment_method) {
        drawText(`via ${payment.payment_method}`, leftMargin + 10, yPos - 15, fontRegular, 9, grayColor);
      }
    }

    // Footer
    yPos = 80;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 20;
    drawText("Thank you for your business!", leftMargin, yPos, fontRegular, 10, grayColor);
    drawText("This is a computer-generated invoice.", width / 2 - 80, yPos - 15, fontRegular, 8, grayColor);

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

    console.log("PDF generated successfully");

    return new Response(
      JSON.stringify({ 
        pdf: base64Pdf,
        filename: `Invoice-${invoiceNumber}.pdf`
      }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );

  } catch (error: any) {
    console.error("Error generating invoice:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
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
      if (num % 10 > 0) {
        words += " " + ones[num % 10];
      }
    }
  }

  return words.trim();
}
