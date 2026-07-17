import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "https://esm.sh/docx@8.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgreementRequest {
  tenantId: string;
  template: "license" | "lease_deed";
  // Aadhaar values are sent only in the request body — never read from or written to the DB.
  landlordAadhaars?: string[];
  tenantAadhaar?: string;
}

const BLANK = "________________________";
const v = (val: string | number | null | undefined, blank = BLANK): string => {
  if (val === null || val === undefined) return blank;
  const s = String(val).trim();
  return s ? s : blank;
};

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v2 = n % 100;
  return n + (s[(v2 - 20) % 10] || s[v2] || s[0]);
};

const dateLabel = (isoDate: string | null | undefined): string => {
  if (!isoDate) return BLANK;
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return BLANK;
  return `${ordinal(d.getDate())} day of ${d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`;
};

const shortDate = (isoDate: string | null | undefined): string => {
  if (!isoDate) return BLANK;
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return BLANK;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const formatINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return BLANK;
  return `Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}/-`;
};

const monthsBetween = (start: string | null, end: string | null): number | null => {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
};

const termLabel = (months: number | null): string => {
  if (months === null) return BLANK;
  if (months % 12 === 0 && months >= 12) {
    const years = months / 12;
    return `${years} (${numberWord(years)}) year${years === 1 ? "" : "s"}`;
  }
  return `${months} (${numberWord(months)}) month${months === 1 ? "" : "s"}`;
};

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const numberWord = (n: number): string => (n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n));

const relationPhrase = (type: string | null | undefined, name: string): string => {
  const abbrev = type === "daughter" ? "D/o" : type === "wife" ? "W/o" : type === "husband" ? "H/o" : "S/o";
  return `${abbrev} ${v(name)}`;
};

// A party to the agreement — an individual (signs personally) or an organisation (signs
// through an authorised representative). Same shape for landlords and the tenant.
interface Party {
  partyType: string; // "individual" | "organisation"
  orgType: string;
  entityName: string;
  signatoryName: string;
  relationType: string;
  relationName: string;
  age: string;
  occupation: string;
  designation: string;
  address: string;
  gstin: string;
  pan: string;
  aadhaar: string; // transient
}

const partyDisplayName = (p: Party): string =>
  (p.partyType === "organisation" ? p.entityName : p.signatoryName) || BLANK;

// The recital description of a party, worded by type. Individuals sign personally;
// organisations are "represented by" their authorised signatory.
const partyClause = (p: Party): string => {
  const idBits = (p.gstin ? `, GSTIN ${p.gstin}` : "") + (p.pan ? `, PAN ${p.pan}` : "");
  if (p.partyType === "organisation") {
    const typeBit = p.orgType ? `a ${p.orgType}, ` : "";
    return `${v(p.entityName)}, ${typeBit}having its office at ${v(p.address)}${idBits}, represented by its ${v(p.designation, "Authorized Signatory")} ${v(p.signatoryName)}, ${relationPhrase(p.relationType, p.relationName)}, aged ${v(p.age)} years, ${v(p.occupation)}, holding Aadhaar No. ${v(p.aadhaar)}`;
  }
  return `${v(p.signatoryName)}, ${relationPhrase(p.relationType, p.relationName)}, aged ${v(p.age)} years, ${v(p.occupation)}, residing at ${v(p.address)}${idBits}, holding Aadhaar No. ${v(p.aadhaar)}`;
};

// ---- shared paragraph builders ----
const heading = (text: string) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 240 } });

const para = (text: string, opts: { bold?: boolean; italics?: boolean; spacingAfter?: number } = {}) =>
  new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics })],
    spacing: { after: opts.spacingAfter ?? 200 },
  });

const clause = (num: string, text: string) =>
  new Paragraph({ children: [new TextRun({ text: `${num}. `, bold: true }), new TextRun({ text })], spacing: { after: 160 } });

const subClause = (label: string, text: string) =>
  new Paragraph({ children: [new TextRun({ text: `${label}) `, bold: true }), new TextRun({ text })], spacing: { after: 140 }, indent: { left: 360 } });

const sectionHeading = (num: string, text: string) =>
  new Paragraph({ children: [new TextRun({ text: `${num}. ${text}`, bold: true, size: 24 })], spacing: { before: 240, after: 160 } });

const cell = (text: string, opts: { header?: boolean; width?: number } = {}) =>
  new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: !!opts.header })] })],
  });

const simpleTable = (rows: string[][]) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
    },
    rows: rows.map((r, i) => new TableRow({ children: r.map((c) => cell(c, { header: i === 0, width: 100 / r.length })) })),
  });

const landlordPartyParagraph = (l: Party, index: number, total: number): Paragraph => {
  const label = total > 1 ? `${index + 1}) ` : "";
  return new Paragraph({
    children: [new TextRun({ text: label, bold: true }), new TextRun({ text: `${partyClause(l)}.` })],
    spacing: { after: 160 },
  });
};

// One party's signature block: the name, and (for organisations) the representative line.
const signatureLines = (p: Party): Paragraph[] => {
  const out: Paragraph[] = [para(partyDisplayName(p), { bold: true, spacingAfter: 40 })];
  if (p.partyType === "organisation") {
    out.push(para(`Represented by ${v(p.designation, "Authorized Signatory")}: ${v(p.signatoryName)}`, { spacingAfter: 500 }));
  } else {
    out.push(para("(Signature)", { spacingAfter: 500 }));
  }
  return out;
};

const signatureSection = (landlords: Party[], tenant: Party, landlordRole: string, tenantRole: string): Paragraph[] => {
  const out: Paragraph[] = [];
  out.push(para(`${landlordRole}${landlords.length > 1 ? "S" : ""}:`, { bold: true, spacingAfter: 200 }));
  landlords.forEach((l, i) => {
    if (landlords.length > 1) out.push(para(`(${i + 1})`, { spacingAfter: 20 }));
    signatureLines(l).forEach((p) => out.push(p));
  });
  out.push(para(`${tenantRole}:`, { bold: true, spacingAfter: 40 }));
  signatureLines(tenant).forEach((p) => out.push(p));
  out.push(para("Witnesses:", { bold: true, spacingAfter: 200 }));
  out.push(para("1. ______________________________"));
  out.push(para("2. ______________________________", { spacingAfter: 200 }));
  return out;
};

interface Data {
  agreementDateLabel: string;
  landlords: Party[];
  tenant: Party;

  propertyName: string;
  propertyAddress: string;
  doorNumber: string;
  surveyNumber: string;
  subDivisionNumber: string;
  village: string;
  taluk: string;
  district: string;
  undividedShare: string;
  boundaryNorth: string;
  boundarySouth: string;
  boundaryEast: string;
  boundaryWest: string;
  totalSqft: string;
  corpNumberText: string;

  purposeOfUse: string;
  leaseStartShort: string;
  leaseEndShort: string;
  termMonths: number | null;
  monthlyRent: number | null;
  dueDaysAfterInvoice: string;
  securityDeposit: string;
  noticePeriodMonths: string;
  lockInPeriodMonths: string | null;
  escalationPercent: number | null;
  escalationFrequencyYears: number | null;
  renewalTerms: string | null;
  minorMaintenanceBy: string;
  majorMaintenanceBy: string;
  buildingTaxBy: string;
}

const collectiveLandlordName = (landlords: Party[]): string =>
  landlords.map((l) => partyDisplayName(l)).filter((s) => s && s !== BLANK).join(" and ") || BLANK;

function buildLicenseAgreement(d: Data): Document {
  const children: (Paragraph | Table)[] = [];
  children.push(heading("LICENSE AGREEMENT"));
  children.push(para(`This Agreement is entered into on this ${d.agreementDateLabel}, between:`));
  d.landlords.forEach((l, i) => children.push(landlordPartyParagraph(l, i, d.landlords.length)));
  children.push(
    para(
      d.landlords.length > 1
        ? `The parties above are hereinafter collectively referred to as the "LICENSOR" (which expression shall, unless repugnant to the subject or context thereof, be deemed to mean and include their respective successors, permitted assigns, executors and administrators) of the FIRST PART;`
        : `(Hereinafter referred to as the "LICENSOR" which expression shall, unless repugnant to the subject or context thereof, be deemed to mean and include its successors, permitted assigns, executors and administrators) of the FIRST PART;`
    )
  );
  children.push(para("AND"));
  children.push(
    para(
      `${partyClause(d.tenant)} (hereinafter referred to as the "LICENSEE" which expression shall, unless repugnant to the subject or context thereof, be deemed to mean and include its successors, permitted assigns, executors and administrators) of the SECOND PART.`
    )
  );

  children.push(
    para(
      `WHEREAS the Licensor is the absolute owner in possession and enjoyment of the property bearing Door No. ${v(d.doorNumber)} admeasuring ${v(d.totalSqft)} sq.ft., situated in Survey No. ${v(d.surveyNumber)}${d.subDivisionNumber && d.subDivisionNumber !== BLANK ? "/" + d.subDivisionNumber : ""} of ${v(d.village)} Village, ${v(d.taluk)} Taluk, ${v(d.district)} District, in the building known as "${v(d.propertyName)}" (hereinafter referred to as the "Scheduled Premises", more particularly described in the Schedule hereunder).`
    )
  );
  children.push(
    para(
      `AND WHEREAS the Licensee has approached the Licensor for grant of leave and license of the Scheduled Premises for the purpose of ${v(d.purposeOfUse, "the Licensee's business")}, for a period of ${termLabel(d.termMonths)} commencing from ${d.leaseStartShort}, and the Licensor has agreed for the same.`
    )
  );
  children.push(para("AND WHEREAS both parties desire to reduce into writing the terms of their understanding in this regard and are accordingly executing this Agreement."));
  children.push(para("NOW THIS WITNESSETH AND IT IS HEREBY AGREED BY AND BETWEEN THE PARTIES HERETO AS FOLLOWS:", { bold: true }));

  children.push(clause("1", `The Licensor hereby grants leave to the Licensee, and the Licensee accepts the same, to occupy and use the Scheduled Premises for the purpose of ${v(d.purposeOfUse, "the Licensee's business")}, for a period of ${termLabel(d.termMonths)} commencing from ${d.leaseStartShort} and ending on ${d.leaseEndShort}.`));
  children.push(clause("2", `The Licensor shall permit the Licensee to take possession of the Scheduled Premises from ${d.leaseStartShort} ("License Commencement Date") onwards.`));
  children.push(clause("3", `The Licensee shall pay a sum of ${formatINR(d.monthlyRent)} per month (excluding applicable GST) towards license fee for the Scheduled Premises, within ${v(d.dueDaysAfterInvoice)} days from the date of the invoice raised by the Licensor. All payments shall be made only through Account Payee Cheque/bank transfer, after deducting TDS as applicable.`));
  children.push(clause("4", "Any delay in payment of the license fee shall entitle the Licensor to 18% per annum interest on such delayed payment, from the date it fell due till the date it is finally paid."));
  children.push(clause("5", `The Licensee has deposited with the Licensor an interest-free, refundable security deposit of ${v(d.securityDeposit, formatINR(null))} towards the fulfilment of this Agreement, which shall be refunded by the Licensor at the time of the Licensee handing over vacant possession of the Scheduled Premises in good condition.`));
  children.push(clause("6", "The Licensee shall pay the charges towards consumption of electricity and water as per the bills received from the respective authorities, from the date of occupation till the date of vacating the Scheduled Premises."));
  children.push(clause("7", `Building tax in respect of the Scheduled Premises shall be borne by the ${d.buildingTaxBy === "tenant" ? "Licensee" : "Licensor"}.`));
  children.push(clause("8", "TERMINATION: This Agreement shall be terminated under any of the following circumstances:"));
  children.push(subClause("a", `By the Licensee giving ${v(d.noticePeriodMonths, "1")} month(s) written notice to the Licensor expressing intention to terminate this Agreement.`));
  children.push(subClause("b", "By the Licensor, in the event of non-payment of license fee for one month or more, or for a material breach of this Agreement by the Licensee, subject to a 30 (thirty) day notice to remedy the breach."));
  let n = 9;
  if (d.lockInPeriodMonths) {
    children.push(clause(String(n++), `LOCK-IN PERIOD: The Licensee shall not terminate this Agreement before the expiry of ${d.lockInPeriodMonths} months from the License Commencement Date.`));
  }
  children.push(clause(String(n++), `This Agreement is granted for the specific purpose of ${v(d.purposeOfUse, "the Licensee's business")}, for which the Licensee shall obtain all necessary legal and statutory permissions from the concerned authorities, failing which the Licensee alone shall bear the consequences.`));
  children.push(clause(String(n++), "The Licensee shall not be entitled to sub-let, mortgage, assign or otherwise part with possession of the Scheduled Premises."));
  children.push(clause(String(n++), "The Licensee is not permitted to alter, add to, or remove any part of the existing structure of the Scheduled Premises in any manner, without the prior written permission of the Licensor."));
  children.push(clause(String(n++), `Necessary maintenance of the Scheduled Premises, incidental to peaceful occupation and enjoyment for the purpose for which it is taken, shall be borne by the ${d.minorMaintenanceBy === "landlord" ? "Licensor" : "Licensee"}, whereas major/structural maintenance shall be borne by the ${d.majorMaintenanceBy === "tenant" ? "Licensee" : "Licensor"}.`));
  children.push(clause(String(n++), "The Licensee hereby agrees not to carry on, or permit to be carried on, at the Scheduled Premises any offensive or dangerous activity, or any activity prohibited by law."));
  children.push(clause(String(n++), `RENEWAL: ${v(d.renewalTerms, `This Agreement may be renewed on expiry for a further like period, ${d.escalationPercent ? `by enhancing the existing license fee by ${d.escalationPercent}%` : "on terms mutually agreed between the parties"}, and can be renewed further on terms mutually agreed between the Licensor and the Licensee.`)}`));
  children.push(clause(String(n++), "The original of this Agreement shall be retained by the Licensor, and a duplicate of the same shall be retained by the Licensee."));

  children.push(para("IN WITNESS WHEREOF the parties herein have set their respective hands to this Agreement on the date mentioned above.", { spacingAfter: 400 }));
  signatureSection(d.landlords, d.tenant, "LICENSOR", "LICENSEE").forEach((p) => children.push(p));

  children.push(heading("SCHEDULE — Description of Property"));
  children.push(
    simpleTable([
      ["Particular", "Detail"],
      ["Door Number", v(d.doorNumber)],
      ["Survey Number", v(d.surveyNumber)],
      ["Sub-division Number", v(d.subDivisionNumber)],
      ["Village/Desom", v(d.village)],
      ["Taluk", v(d.taluk)],
      ["District", v(d.district)],
      ["Extent", `${v(d.totalSqft)} sq.ft.`],
      ["Undivided Share", v(d.undividedShare)],
      ["Building Name", v(d.propertyName)],
      ["Corp/Unit Numbers", v(d.corpNumberText, "—")],
    ])
  );
  children.push(para("", { spacingAfter: 100 }));
  children.push(
    simpleTable([
      ["Boundary", "Bounded By"],
      ["North", v(d.boundaryNorth)],
      ["South", v(d.boundarySouth)],
      ["East", v(d.boundaryEast)],
      ["West", v(d.boundaryWest)],
    ])
  );

  return new Document({ sections: [{ children }] });
}

function buildLeaseDeed(d: Data): Document {
  const children: (Paragraph | Table)[] = [];
  children.push(heading("LEASE DEED"));
  children.push(para(`THIS LEASE DEED is executed on this ${d.agreementDateLabel} by and between:`));
  d.landlords.forEach((l, i) => children.push(landlordPartyParagraph(l, i, d.landlords.length)));
  children.push(
    para(
      d.landlords.length > 1
        ? `The parties above are hereinafter collectively referred to as the "LESSOR" (which expression shall, unless repugnant to the subject or context thereof, include their respective successors, executors, administrators and permitted assigns) of the ONE PART;`
        : `(Hereinafter referred to as the "LESSOR", which expression shall, unless repugnant to the subject or context thereof, include its successors, executors, administrators and permitted assigns) of the ONE PART;`
    )
  );
  children.push(para("AND"));
  children.push(
    para(
      `${partyClause(d.tenant)} (hereinafter referred to as the "LESSEE", which expression shall, unless repugnant to the subject or context thereof, include its successors and permitted assigns) of the OTHER PART.`
    )
  );
  children.push(para("(The Lessor and the Lessee are hereinafter collectively referred to as the \"Parties\" and individually as a \"Party\").", { italics: true }));

  children.push(
    para(
      `WHEREAS the Lessor is absolutely seized and possessed of and otherwise well and sufficiently entitled to the premises admeasuring ${v(d.totalSqft)} sq.ft., bearing Door No. ${v(d.doorNumber)}, in the building known as "${v(d.propertyName)}", situated in Survey No. ${v(d.surveyNumber)}${d.subDivisionNumber && d.subDivisionNumber !== BLANK ? "/" + d.subDivisionNumber : ""} of ${v(d.village)} Village, ${v(d.taluk)} Taluk, ${v(d.district)} District, with an undivided share of ${v(d.undividedShare)} (hereinafter referred to as the "Demised Premises", more particularly described in the Schedule to this Lease Deed).`
    )
  );
  children.push(
    para(
      `AND WHEREAS the Parties are desirous of the Lessor demising, and the Lessee taking on lease, the Demised Premises for the purpose of ${v(d.purposeOfUse, "the Lessee's business")}, on the terms and conditions agreed between them as set out below.`
    )
  );
  children.push(para("NOW THEREFORE THESE PRESENTS WITNESSETH THAT:", { bold: true }));

  children.push(sectionHeading("1", "TERM"));
  children.push(para(`The Lessor hereby grants to the Lessee, lease of the Demised Premises for a period of ${termLabel(d.termMonths)} with effect from ${d.leaseStartShort} to ${d.leaseEndShort}.`));

  children.push(sectionHeading("2", "RENT"));
  if (d.escalationPercent && d.escalationFrequencyYears && d.termMonths) {
    children.push(para(`The Lessee shall pay the Lessor a fixed lease rent as stated below, plus applicable GST, subject to tax deduction at source as per the Income Tax Act. There shall be an increase in monthly rent by ${d.escalationPercent}% every ${d.escalationFrequencyYears} year(s):`));
    const rows: string[][] = [["Lease Period", "Lease Rent per month"]];
    const start = new Date(d.leaseStartShort.split("/").reverse().join("-"));
    let periodStart = new Date(start);
    let rent = d.monthlyRent || 0;
    const end = d.termMonths;
    let monthsCovered = 0;
    const freqMonths = d.escalationFrequencyYears * 12;
    while (monthsCovered < end && rows.length < 20) {
      const periodEnd = new Date(periodStart);
      const thisSpan = Math.min(freqMonths, end - monthsCovered);
      periodEnd.setMonth(periodEnd.getMonth() + thisSpan);
      periodEnd.setDate(periodEnd.getDate() - 1);
      rows.push([`${shortDate(periodStart.toISOString())} to ${shortDate(periodEnd.toISOString())}`, formatINR(Math.round(rent))]);
      rent = rent * (1 + d.escalationPercent / 100);
      periodStart = new Date(periodEnd);
      periodStart.setDate(periodStart.getDate() + 1);
      monthsCovered += thisSpan;
    }
    children.push(simpleTable(rows));
  } else {
    children.push(para(`The Lessee shall pay the Lessor a fixed lease rent of ${formatINR(d.monthlyRent)} per month, plus applicable GST, within ${v(d.dueDaysAfterInvoice)} days from the date of the invoice raised by the Lessor, subject to tax deduction at source as per the Income Tax Act.`));
  }
  children.push(para("The Lessee shall, in addition to the monthly lease rent, be liable to pay the electricity and water charges consumed in the Demised Premises as per separate meters. All municipal taxes, cesses and other outgoings in respect of the Demised Premises, present and future, shall be borne and payable by the Lessor unless otherwise agreed."));

  children.push(sectionHeading("3", "SECURITY DEPOSIT / RETENTION MONEY"));
  children.push(para(`The Lessee has deposited with the Lessor an interest-free, refundable security deposit of ${v(d.securityDeposit, formatINR(null))}, which shall be refunded without interest to the Lessee at the time of the Lessee handing over vacant possession of the Demised Premises to the Lessor, upon termination or expiry of the lease.`));

  children.push(sectionHeading("4", "LESSOR'S OBLIGATIONS"));
  children.push(para(`The Lessor warrants that it has a clear, free and marketable title to the Demised Premises, free from encumbrances, and undertakes to carry out all major repairs (structural, roof, water-proofing) to the Demised Premises within a reasonable period of being notified by the Lessee. Building tax in respect of the Demised Premises shall be borne by the ${d.buildingTaxBy === "tenant" ? "Lessee" : "Lessor"}.`));

  children.push(sectionHeading("5", "LESSEE'S OBLIGATIONS"));
  children.push(para(`The Lessee shall regularly pay the monthly rent and other charges as aforesaid, ensure the Demised Premises are used only for ${v(d.purposeOfUse, "the Lessee's business")}, and at its own cost carry out all internal/minor repairs to keep the Demised Premises in good condition. On expiry or termination, the Lessee shall hand over vacant possession of the Demised Premises against simultaneous refund of the Security Deposit.`));

  children.push(sectionHeading("6", "INDEMNITY"));
  children.push(para("Each Party shall indemnify and keep indemnified the other against all claims, costs, damages, demands, expenses, losses, fines, penalties and/or liabilities arising directly out of that Party's own default, negligence or breach of this Lease Deed."));

  children.push(sectionHeading("7", "RENEWAL OF LEASE"));
  children.push(para(`${v(d.renewalTerms, "The lease may be renewed only if both Parties agree to do so, and on such terms and conditions as may be mutually agreed in writing between the Parties, with a fresh lease deed.")}`));

  children.push(sectionHeading("8", "TERMINATION OF LEASE"));
  children.push(subClause("i", `The lease may be terminated at the option of the Lessee by giving a minimum of ${v(d.noticePeriodMonths, "3")} month(s) notice in writing in advance to the Lessor.`));
  children.push(subClause("ii", "If the rent payable is in arrears for a period of two consecutive months or more, the Lessor shall give a notice in writing to the Lessee to remedy the breach within thirty (30) days; if not remedied, the Lessor shall be entitled to terminate the lease upon expiry of a further thirty (30) days from such notice."));
  if (d.lockInPeriodMonths) {
    children.push(subClause("iii", `LOCK-IN PERIOD: The Lessee shall not terminate this lease before the expiry of ${d.lockInPeriodMonths} months from the commencement of the term.`));
  }

  children.push(sectionHeading("9", "FORCE MAJEURE"));
  children.push(para("In case the Demised Premises or any part thereof is destroyed or damaged by a force majeure event (fire, riot, civil commotion, or the like) not within the control of the Parties, rendering it wholly or partially unfit for use, the rent (or a proportionate part thereof) shall cease to be payable until the Demised Premises is restored by the Lessor."));

  children.push(sectionHeading("10", "NOTICES"));
  children.push(para(`Any notice under this Lease Deed shall be served in writing at the address of the Lessor (${v(collectiveLandlordName(d.landlords))}) or the Lessee (${v(d.tenant.address)}) as stated herein.`));

  children.push(sectionHeading("11", "STAMP DUTY AND REGISTRATION CHARGES"));
  children.push(para("This Lease Deed shall be executed and, where required by law, registered. Stamp duty and registration charges shall be borne by the Parties as mutually agreed, in accordance with the applicable State Stamp Act."));

  children.push(sectionHeading("12", "ENTIRE AGREEMENT"));
  children.push(para("This Lease Deed constitutes the entire agreement between the Parties and supersedes all earlier understandings, whether oral or written, concerning its subject matter. No addition, alteration or modification shall be valid unless in writing and signed by both Parties."));

  children.push(sectionHeading("13", "GOVERNING LAW AND JURISDICTION"));
  children.push(para(`This Lease Deed shall be governed by the laws of India. The competent courts at ${v(d.district)} alone shall have jurisdiction over any dispute arising out of this Lease Deed.`));

  children.push(para("IN WITNESS WHEREOF the Parties have executed this Lease Deed on the date first mentioned above.", { spacingAfter: 400 }));
  signatureSection(d.landlords, d.tenant, "LESSOR", "LESSEE").forEach((p) => children.push(p));

  children.push(heading("SCHEDULE — Description of Demised Premises"));
  children.push(
    simpleTable([
      ["Particular", "Detail"],
      ["District", v(d.district)],
      ["Taluk", v(d.taluk)],
      ["Village/Desom", v(d.village)],
      ["Survey Number", v(d.surveyNumber)],
      ["Sub-division Number", v(d.subDivisionNumber)],
      ["Door Number", v(d.doorNumber)],
      ["Extent", `${v(d.totalSqft)} sq.ft.`],
      ["Undivided Share", v(d.undividedShare)],
    ])
  );
  children.push(para("", { spacingAfter: 100 }));
  children.push(
    simpleTable([
      ["Boundary", "Bounded By"],
      ["North", v(d.boundaryNorth)],
      ["South", v(d.boundarySouth)],
      ["East", v(d.boundaryEast)],
      ["West", v(d.boundaryWest)],
    ])
  );

  return new Document({ sections: [{ children }] });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tenantId, template, landlordAadhaars, tenantAadhaar }: AgreementRequest = await req.json();
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Tenant ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select(`*, property:properties(*)`)
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const property = tenant.property;

    const savedLandlords: any[] = Array.isArray(property?.agreement_landlords) ? property.agreement_landlords : [];
    let landlords: Party[];
    if (savedLandlords.length > 0) {
      landlords = savedLandlords.map((l: any, i: number) => ({
        partyType: l.party_type || "individual",
        orgType: l.org_type || "",
        entityName: l.entity_name || "",
        signatoryName: l.signatory_name || "",
        relationType: l.relation_type || "son",
        relationName: l.relation_name || "",
        age: l.age?.toString() || "",
        occupation: l.occupation || "",
        designation: l.designation || "",
        address: l.address || "",
        gstin: l.gstin || "",
        pan: l.pan || "",
        aadhaar: (landlordAadhaars && landlordAadhaars[i]) || "",
      }));
    } else {
      landlords = [
        {
          partyType: "individual",
          orgType: "",
          entityName: "",
          signatoryName: tenant.bill_from_name || "",
          relationType: "son",
          relationName: "",
          age: "",
          occupation: "",
          designation: "",
          address: tenant.bill_from_address || "",
          gstin: tenant.bill_from_gstin || "",
          pan: tenant.bill_from_pan || "",
          aadhaar: (landlordAadhaars && landlordAadhaars[0]) || "",
        },
      ];
    }

    const tenantParty: Party = {
      partyType: tenant.party_type || "individual",
      orgType: tenant.org_type || "",
      entityName: tenant.bill_to_name || tenant.name || "",
      signatoryName: tenant.signatory_name || (tenant.party_type === "organisation" ? "" : tenant.bill_to_name || tenant.name || ""),
      relationType: tenant.signatory_relation_type || "son",
      relationName: tenant.signatory_relation_name || "",
      age: tenant.signatory_age?.toString() || "",
      occupation: tenant.signatory_occupation || "",
      designation: tenant.signatory_designation || "",
      address: tenant.permanent_address || tenant.bill_to_address || "",
      gstin: tenant.bill_to_gstin || "",
      pan: tenant.bill_to_pan || "",
      aadhaar: tenantAadhaar || "",
    };

    const { data: tenantUnits } = await supabase
      .from("tenant_floor_units")
      .select("floor_units(corp_number)")
      .eq("tenant_id", tenantId);
    const corpNumberText = (tenantUnits || [])
      .map((u: any) => u.floor_units?.corp_number)
      .filter(Boolean)
      .join(", ");

    const data: Data = {
      agreementDateLabel: dateLabel(new Date().toISOString()),
      landlords,
      tenant: tenantParty,

      propertyName: property?.name || "",
      propertyAddress: property?.address || "",
      doorNumber: property?.door_number || "",
      surveyNumber: property?.survey_number || "",
      subDivisionNumber: property?.sub_division_number || "",
      village: property?.village || "",
      taluk: property?.taluk || "",
      district: property?.district || "",
      undividedShare: property?.undivided_share || "",
      boundaryNorth: property?.boundary_north || "",
      boundarySouth: property?.boundary_south || "",
      boundaryEast: property?.boundary_east || "",
      boundaryWest: property?.boundary_west || "",
      totalSqft: tenant.rented_sqft?.toString() || "",
      corpNumberText,

      purposeOfUse: tenant.purpose_of_use || "",
      leaseStartShort: shortDate(tenant.lease_start_date),
      leaseEndShort: shortDate(tenant.lease_end_date),
      termMonths: monthsBetween(tenant.lease_start_date, tenant.lease_end_date),
      monthlyRent: tenant.monthly_rent,
      dueDaysAfterInvoice: tenant.due_days_after_invoice?.toString() || "",
      securityDeposit: tenant.security_deposit ? formatINR(tenant.security_deposit) : "",
      noticePeriodMonths: tenant.notice_period_months?.toString() || "",
      lockInPeriodMonths: tenant.lock_in_period_months ? tenant.lock_in_period_months.toString() : null,
      escalationPercent: tenant.rent_escalation_percent || null,
      escalationFrequencyYears: tenant.rent_escalation_frequency_years || null,
      renewalTerms: tenant.renewal_terms || null,
      minorMaintenanceBy: tenant.minor_maintenance_by || "tenant",
      majorMaintenanceBy: tenant.major_maintenance_by || "landlord",
      buildingTaxBy: property?.building_tax_by || "landlord",
    };

    const doc = template === "lease_deed" ? buildLeaseDeed(data) : buildLicenseAgreement(data);
    const base64 = await Packer.toBase64String(doc);

    const templateLabel = template === "lease_deed" ? "Lease-Deed" : "License-Agreement";
    const filename = `${templateLabel}-${(tenant.name || "Tenant").replace(/\s+/g, "-")}.docx`;

    return new Response(JSON.stringify({ docx: base64, filename }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error generating rent agreement:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
