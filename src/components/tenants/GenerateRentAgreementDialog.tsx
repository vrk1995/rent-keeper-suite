import { useEffect, useMemo, useState } from "react";
import {
  FileDown,
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  User,
  Building2,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/currency";
import { Tenant, useUpdateTenant } from "@/hooks/useTenants";
import { useProperties, useUpdateProperty, AgreementLandlord } from "@/hooks/useProperties";
import { useBillingAddresses } from "@/hooks/useBillingAddresses";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { downloadBase64File } from "@/lib/fileDownload";
import { toast } from "sonner";

interface GenerateRentAgreementDialogProps {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AgreementTemplate = "license" | "lease_deed";
type PartyType = "individual" | "organisation";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const RELATION_OPTIONS = [
  { value: "son", label: "Son of" },
  { value: "daughter", label: "Daughter of" },
  { value: "wife", label: "Wife of" },
  { value: "husband", label: "Husband of" },
];

const ORG_TYPE_SUGGESTIONS = [
  "Proprietorship",
  "Partnership Firm",
  "Private Limited Company",
  "Public Limited Company",
  "LLP",
  "HUF",
  "Trust",
  "Society",
  "Association of Persons",
];

const relationNameLabel = (type: string): string => {
  switch (type) {
    case "wife":
      return "Husband's Name";
    case "husband":
      return "Wife's Name";
    case "daughter":
      return "Father's Name";
    default:
      return "Father's Name";
  }
};

// A single editable party (landlord or tenant). `aadhaar` lives here only in memory and is
// never saved to the DB — it is passed transiently to the document generator.
interface PartyDraft {
  party_type: PartyType;
  org_type: string;
  entity_name: string;
  signatory_name: string;
  relation_type: string;
  relation_name: string;
  age: string;
  occupation: string;
  designation: string;
  address: string;
  gstin: string;
  pan: string;
  aadhaar: string;
}

const emptyParty = (): PartyDraft => ({
  party_type: "individual",
  org_type: "",
  entity_name: "",
  signatory_name: "",
  relation_type: "son",
  relation_name: "",
  age: "",
  occupation: "",
  designation: "",
  address: "",
  gstin: "",
  pan: "",
  aadhaar: "",
});

// Switching type carries the name across so the user never re-types it.
const applyPartyType = (d: PartyDraft, next: PartyType): PartyDraft => {
  if (next === d.party_type) return d;
  if (next === "organisation") {
    const entity = d.entity_name || d.signatory_name;
    return { ...d, party_type: next, entity_name: entity, signatory_name: d.entity_name ? d.signatory_name : "" };
  }
  return { ...d, party_type: next, signatory_name: d.signatory_name || d.entity_name };
};

// The display name of a party — the org name if it's an organisation, else the person.
const partyDisplayName = (d: PartyDraft): string =>
  (d.party_type === "organisation" ? d.entity_name : d.signatory_name).trim();

const STEPS = ["Type", "Owner", "Tenant", "Property", "Terms", "Review"];

const monthsBetween = (start: string | null, end: string | null): number | null => {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
};

const termLabel = (months: number | null): string => {
  if (months === null) return "—";
  if (months % 12 === 0 && months >= 12) {
    const y = months / 12;
    return `${y} year${y === 1 ? "" : "s"}`;
  }
  return `${months} month${months === 1 ? "" : "s"}`;
};

const GenerateRentAgreementDialog = ({ tenant, open, onOpenChange }: GenerateRentAgreementDialogProps) => {
  const { data: properties } = useProperties();
  const { data: billingAddresses } = useBillingAddresses();
  const updateTenant = useUpdateTenant();
  const updateProperty = useUpdateProperty();

  const property = useMemo(
    () => properties?.find((p) => p.id === tenant?.property_id) || null,
    [properties, tenant?.property_id]
  );
  const billingAddress = useMemo(
    () => billingAddresses?.find((a) => a.name === tenant?.bill_from_name) || null,
    [billingAddresses, tenant?.bill_from_name]
  );

  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<AgreementTemplate>("license");
  const [generating, setGenerating] = useState(false);

  const [landlords, setLandlords] = useState<PartyDraft[]>([emptyParty()]);
  const [tenantParty, setTenantParty] = useState<PartyDraft>(emptyParty());

  const [propertyFields, setPropertyFields] = useState({
    survey_number: "",
    sub_division_number: "",
    village: "",
    taluk: "",
    district: "",
    door_number: "",
    boundary_north: "",
    boundary_south: "",
    boundary_east: "",
    boundary_west: "",
    undivided_share: "",
    building_tax_by: "landlord",
  });

  const [terms, setTerms] = useState({
    purpose_of_use: "",
    notice_period_months: "1",
    lock_in_period_months: "",
    rent_escalation_percent: "",
    rent_escalation_frequency_years: "",
    renewal_terms: "",
    minor_maintenance_by: "tenant",
    major_maintenance_by: "landlord",
  });

  useEffect(() => {
    if (!open || !tenant) return;
    setStep(0);
    setTemplate((tenant.agreement_template as AgreementTemplate) || "license");

    const saved = (property?.agreement_landlords as unknown as AgreementLandlord[] | null) || null;
    if (saved && saved.length > 0) {
      setLandlords(
        saved.map((l) => ({
          ...emptyParty(),
          ...l,
          party_type: (l.party_type as PartyType) || "individual",
          aadhaar: "",
        }))
      );
    } else {
      setLandlords([
        {
          ...emptyParty(),
          signatory_name: tenant.bill_from_name || billingAddress?.name || "",
          address: tenant.bill_from_address || billingAddress?.address || "",
          gstin: tenant.bill_from_gstin || billingAddress?.gstin || "",
          pan: tenant.bill_from_pan || billingAddress?.pan || "",
        },
      ]);
    }

    const tParty = (tenant.party_type as PartyType) || "individual";
    setTenantParty({
      ...emptyParty(),
      party_type: tParty,
      org_type: tenant.org_type || "",
      entity_name: tenant.bill_to_name || tenant.name || "",
      signatory_name: tenant.signatory_name || (tParty === "individual" ? tenant.bill_to_name || tenant.name || "" : ""),
      relation_type: tenant.signatory_relation_type || "son",
      relation_name: tenant.signatory_relation_name || "",
      age: tenant.signatory_age?.toString() || "",
      occupation: tenant.signatory_occupation || "",
      designation: tenant.signatory_designation || "",
      address: tenant.permanent_address || tenant.bill_to_address || "",
      gstin: tenant.bill_to_gstin || "",
      pan: tenant.bill_to_pan || "",
    });

    setPropertyFields({
      survey_number: property?.survey_number || "",
      sub_division_number: property?.sub_division_number || "",
      village: property?.village || "",
      taluk: property?.taluk || "",
      district: property?.district || "",
      door_number: property?.door_number || "",
      boundary_north: property?.boundary_north || "",
      boundary_south: property?.boundary_south || "",
      boundary_east: property?.boundary_east || "",
      boundary_west: property?.boundary_west || "",
      undivided_share: property?.undivided_share || "",
      building_tax_by: property?.building_tax_by || "landlord",
    });
    setTerms({
      purpose_of_use: tenant.purpose_of_use || "",
      notice_period_months: tenant.notice_period_months?.toString() || "1",
      lock_in_period_months: tenant.lock_in_period_months?.toString() || "",
      rent_escalation_percent: tenant.rent_escalation_percent?.toString() || "",
      rent_escalation_frequency_years: tenant.rent_escalation_frequency_years?.toString() || "",
      renewal_terms: tenant.renewal_terms || "",
      minor_maintenance_by: tenant.minor_maintenance_by || "tenant",
      major_maintenance_by: tenant.major_maintenance_by || "landlord",
    });
  }, [open, tenant, property, billingAddress]);

  const updateLandlord = (i: number, next: PartyDraft) =>
    setLandlords((prev) => prev.map((l, idx) => (idx === i ? next : l)));
  const addLandlord = () => setLandlords((prev) => [...prev, emptyParty()]);
  const removeLandlord = (i: number) => setLandlords((prev) => prev.filter((_, idx) => idx !== i));

  const termMonths = monthsBetween(tenant?.lease_start_date ?? null, tenant?.lease_end_date ?? null);

  const missing = useMemo(() => {
    const m: string[] = [];
    landlords.forEach((l, i) => {
      const who = landlords.length > 1 ? `Owner ${i + 1}` : "Owner";
      if (!partyDisplayName(l)) m.push(`${who}'s name`);
      if (l.party_type === "organisation" && !l.signatory_name) m.push(`${who}'s signatory (who signs for the ${l.org_type || "organisation"})`);
      if (!l.relation_name) m.push(`${who}'s ${relationNameLabel(l.relation_type).toLowerCase()}`);
    });
    if (!partyDisplayName(tenantParty)) m.push("Tenant's name");
    if (tenantParty.party_type === "organisation" && !tenantParty.signatory_name) m.push("Tenant's signatory");
    if (!tenantParty.relation_name) m.push(`Tenant's ${relationNameLabel(tenantParty.relation_type).toLowerCase()}`);
    if (!tenantParty.address) m.push("Tenant's address");
    if (!terms.purpose_of_use) m.push("What the tenant will use the place for");
    return m;
  }, [landlords, tenantParty, terms]);

  const handleGenerate = async () => {
    if (!tenant) return;
    setGenerating(true);
    try {
      if (property) {
        const landlordsForSave: AgreementLandlord[] = landlords.map((l) => ({
          party_type: l.party_type,
          org_type: l.org_type,
          entity_name: l.entity_name,
          signatory_name: l.signatory_name,
          relation_type: l.relation_type,
          relation_name: l.relation_name,
          age: l.age,
          occupation: l.occupation,
          designation: l.designation,
          address: l.address,
          gstin: l.gstin,
          pan: l.pan,
        }));
        await updateProperty.mutateAsync({
          id: property.id,
          survey_number: propertyFields.survey_number || null,
          sub_division_number: propertyFields.sub_division_number || null,
          village: propertyFields.village || null,
          taluk: propertyFields.taluk || null,
          district: propertyFields.district || null,
          door_number: propertyFields.door_number || null,
          boundary_north: propertyFields.boundary_north || null,
          boundary_south: propertyFields.boundary_south || null,
          boundary_east: propertyFields.boundary_east || null,
          boundary_west: propertyFields.boundary_west || null,
          undivided_share: propertyFields.undivided_share || null,
          building_tax_by: propertyFields.building_tax_by || null,
          agreement_landlords: landlordsForSave as unknown as Json,
        });
      }

      const tenantName = partyDisplayName(tenantParty) || tenant.name;
      await updateTenant.mutateAsync({
        id: tenant.id,
        agreement_template: template,
        party_type: tenantParty.party_type,
        org_type: tenantParty.org_type || null,
        bill_to_name: tenantName || null,
        bill_to_gstin: tenantParty.gstin || null,
        bill_to_pan: tenantParty.pan || null,
        permanent_address: tenantParty.address || null,
        signatory_name: (tenantParty.party_type === "organisation" ? tenantParty.signatory_name : tenantParty.signatory_name || tenantName) || null,
        signatory_relation_type: tenantParty.relation_type || null,
        signatory_relation_name: tenantParty.relation_name || null,
        signatory_age: tenantParty.age ? Number(tenantParty.age) : null,
        signatory_occupation: tenantParty.occupation || null,
        signatory_designation: tenantParty.designation || null,
        purpose_of_use: terms.purpose_of_use || null,
        notice_period_months: terms.notice_period_months ? Number(terms.notice_period_months) : null,
        lock_in_period_months: terms.lock_in_period_months ? Number(terms.lock_in_period_months) : null,
        rent_escalation_percent: terms.rent_escalation_percent ? Number(terms.rent_escalation_percent) : null,
        rent_escalation_frequency_years: terms.rent_escalation_frequency_years ? Number(terms.rent_escalation_frequency_years) : null,
        renewal_terms: terms.renewal_terms || null,
        minor_maintenance_by: terms.minor_maintenance_by || null,
        major_maintenance_by: terms.major_maintenance_by || null,
      });

      const { data, error } = await supabase.functions.invoke("generate-rent-agreement", {
        body: {
          tenantId: tenant.id,
          template,
          landlordAadhaars: landlords.map((l) => l.aadhaar),
          tenantAadhaar: tenantParty.aadhaar,
        },
      });
      if (error) throw error;

      downloadBase64File(data.docx, data.filename || "Rent-Agreement.docx", DOCX_MIME);
      toast.success("Rent agreement generated!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to generate agreement: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setGenerating(false);
    }
  };

  if (!tenant) return null;

  // ---- reusable party editor ----
  const renderParty = (value: PartyDraft, onChange: (next: PartyDraft) => void, role: "landlord" | "tenant") => {
    const set = (patch: Partial<PartyDraft>) => onChange({ ...value, ...patch });
    const isOrg = value.party_type === "organisation";
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange(applyPartyType(value, "individual"))}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
              !isOrg ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/50"
            )}
          >
            <User className="h-4 w-4" /> An individual person
          </button>
          <button
            type="button"
            onClick={() => onChange(applyPartyType(value, "organisation"))}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
              isOrg ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/50"
            )}
          >
            <Building2 className="h-4 w-4" /> A firm / company
          </button>
        </div>

        {isOrg && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Organisation name</Label>
                <Input placeholder="e.g., Acme Traders" value={value.entity_name} onChange={(e) => set({ entity_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Type of organisation</Label>
                <Input list="rk-org-types" placeholder="e.g., Partnership Firm" value={value.org_type} onChange={(e) => set({ org_type: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Who signs on its behalf?</Label>
                <Input placeholder="e.g., John Doe" value={value.signatory_name} onChange={(e) => set({ signatory_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Their role</Label>
                <Input placeholder="e.g., Partner / Director" value={value.designation} onChange={(e) => set({ designation: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {!isOrg && (
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input placeholder="e.g., John Doe" value={value.signatory_name} onChange={(e) => set({ signatory_name: e.target.value })} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{isOrg ? "Signatory is…" : "Relation"}</Label>
            <Select value={value.relation_type} onValueChange={(v) => set({ relation_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{relationNameLabel(value.relation_type)}</Label>
            <Input placeholder="e.g., Richard Doe" value={value.relation_name} onChange={(e) => set({ relation_name: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Age <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <Input type="number" min={0} value={value.age} onChange={(e) => set({ age: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Occupation <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="e.g., Business" value={value.occupation} onChange={(e) => set({ occupation: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{role === "tenant" ? "Permanent / home address" : "Address"}</Label>
          <Textarea rows={2} value={value.address} onChange={(e) => set({ address: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>PAN <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <Input maxLength={10} value={value.pan} onChange={(e) => set({ pan: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label>GSTIN <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <Input maxLength={15} value={value.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1">
            Aadhaar number <span className="text-[10px] text-muted-foreground font-normal">(optional · not saved)</span>
          </Label>
          <Input
            maxLength={14}
            placeholder="Used only for this document"
            value={value.aadhaar}
            onChange={(e) => set({ aadhaar: e.target.value })}
          />
        </div>
      </div>
    );
  };

  const stepBody = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick the kind of agreement you need. Not sure? A <strong>License Agreement</strong> is the
              usual choice for shops, offices and shorter rentals.
            </p>
            {[
              {
                val: "license" as const,
                title: "License Agreement",
                desc: "Short and simple. Best for most shops, offices and rentals up to a couple of years. Renewable.",
              },
              {
                val: "lease_deed" as const,
                title: "Lease Deed",
                desc: "Longer and more formal, with a rent-increase schedule. Best for long-term tenants and registered leases.",
              },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setTemplate(opt.val)}
                className={cn(
                  "w-full text-left rounded-lg border p-4 transition-colors",
                  template === opt.val ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{opt.title}</span>
                  {template === opt.val && <Check className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Who owns / is renting out the property? Most of the time this is one person or firm — but you
              can add more than one owner if the property is jointly owned.
            </p>
            {landlords.map((l, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Owner {i + 1}</span>
                  {landlords.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove owner" onClick={() => removeLandlord(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                {renderParty(l, (next) => updateLandlord(i, next), "landlord")}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLandlord}>
              <Plus className="h-4 w-4 mr-1" /> Add another owner
            </Button>
          </div>
        );
      case 2:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Who is renting the property (the tenant)?</p>
            {renderParty(tenantParty, setTenantParty, "tenant")}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/20 text-sm space-y-1">
              <p className="font-medium">{property?.name || "—"}</p>
              <p className="text-muted-foreground">{property?.address || "No address on record"}</p>
              <p className="text-muted-foreground">Area let out: {tenant.rented_sqft ? `${tenant.rented_sqft} sq.ft.` : "—"}</p>
            </div>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="legal" className="border rounded-lg px-3">
                <AccordionTrigger className="text-sm">
                  Add legal / registration details (optional)
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-1">
                  <p className="text-xs text-muted-foreground">
                    Only needed if you plan to register the agreement at the Sub-Registrar's office. You can
                    skip all of this and fill it in on paper later.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Municipal door number</Label>
                      <Input value={propertyFields.door_number} onChange={(e) => setPropertyFields({ ...propertyFields, door_number: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Survey number</Label>
                      <Input value={propertyFields.survey_number} onChange={(e) => setPropertyFields({ ...propertyFields, survey_number: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Sub-division number</Label>
                      <Input value={propertyFields.sub_division_number} onChange={(e) => setPropertyFields({ ...propertyFields, sub_division_number: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Undivided land share</Label>
                      <Input placeholder="e.g., 1000/50000 in 10 Ares" value={propertyFields.undivided_share} onChange={(e) => setPropertyFields({ ...propertyFields, undivided_share: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>Village</Label>
                      <Input value={propertyFields.village} onChange={(e) => setPropertyFields({ ...propertyFields, village: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Taluk</Label>
                      <Input value={propertyFields.taluk} onChange={(e) => setPropertyFields({ ...propertyFields, taluk: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>District</Label>
                      <Input value={propertyFields.district} onChange={(e) => setPropertyFields({ ...propertyFields, district: e.target.value })} />
                    </div>
                  </div>
                  <p className="text-xs font-medium pt-1">Surrounding boundaries</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>North</Label>
                      <Input value={propertyFields.boundary_north} onChange={(e) => setPropertyFields({ ...propertyFields, boundary_north: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>South</Label>
                      <Input value={propertyFields.boundary_south} onChange={(e) => setPropertyFields({ ...propertyFields, boundary_south: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>East</Label>
                      <Input value={propertyFields.boundary_east} onChange={(e) => setPropertyFields({ ...propertyFields, boundary_east: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>West</Label>
                      <Input value={propertyFields.boundary_west} onChange={(e) => setPropertyFields({ ...propertyFields, boundary_west: e.target.value })} />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/20 text-sm grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Monthly rent</p>
                <p className="font-medium">{formatINR(tenant.monthly_rent || 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Term</p>
                <p className="font-medium">{termLabel(termMonths)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deposit</p>
                <p className="font-medium">{formatINR(tenant.security_deposit || 0)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Rent, term and deposit come from the tenant's record. Edit them on the tenant if they're wrong.
            </p>
            <div className="space-y-1.5">
              <Label>What will the tenant use the place for?</Label>
              <Textarea
                rows={2}
                placeholder="e.g., running a retail business"
                value={terms.purpose_of_use}
                onChange={(e) => setTerms({ ...terms, purpose_of_use: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notice period to end the agreement (months)</Label>
              <Input
                type="number"
                min={0}
                value={terms.notice_period_months}
                onChange={(e) => setTerms({ ...terms, notice_period_months: e.target.value })}
              />
            </div>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="adv" className="border rounded-lg px-3">
                <AccordionTrigger className="text-sm">More options (optional)</AccordionTrigger>
                <AccordionContent className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Lock-in period (months)</Label>
                      <Input type="number" min={0} placeholder="Leave blank if none" value={terms.lock_in_period_months} onChange={(e) => setTerms({ ...terms, lock_in_period_months: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Rent increase (%)</Label>
                      <Input type="number" min={0} placeholder="e.g., 15" value={terms.rent_escalation_percent} onChange={(e) => setTerms({ ...terms, rent_escalation_percent: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>…every (years)</Label>
                      <Input type="number" min={0} placeholder="e.g., 3" value={terms.rent_escalation_frequency_years} onChange={(e) => setTerms({ ...terms, rent_escalation_frequency_years: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Building tax paid by</Label>
                      <Select value={propertyFields.building_tax_by} onValueChange={(v) => setPropertyFields({ ...propertyFields, building_tax_by: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="landlord">Owner</SelectItem>
                          <SelectItem value="tenant">Tenant</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Small repairs by</Label>
                      <Select value={terms.minor_maintenance_by} onValueChange={(v) => setTerms({ ...terms, minor_maintenance_by: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tenant">Tenant</SelectItem>
                          <SelectItem value="landlord">Owner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Major repairs by</Label>
                      <Select value={terms.major_maintenance_by} onValueChange={(v) => setTerms({ ...terms, major_maintenance_by: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="landlord">Owner</SelectItem>
                          <SelectItem value="tenant">Tenant</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Renewal terms</Label>
                    <Textarea rows={2} placeholder="Leave blank to use the standard renewal wording" value={terms.renewal_terms} onChange={(e) => setTerms({ ...terms, renewal_terms: e.target.value })} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        );
      case 5:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Here's what will go into the agreement. Check it, then generate.</p>
            <div className="rounded-lg border divide-y text-sm">
              <div className="p-3">
                <p className="text-xs text-muted-foreground">Agreement type</p>
                <p className="font-medium">{template === "lease_deed" ? "Lease Deed" : "License Agreement"}</p>
              </div>
              <div className="p-3">
                <p className="text-xs text-muted-foreground">Owner{landlords.length > 1 ? "s" : ""}</p>
                {landlords.map((l, i) => (
                  <p key={i} className="font-medium">
                    {partyDisplayName(l) || "—"}{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      ({l.party_type === "organisation" ? l.org_type || "organisation" : "individual"})
                    </span>
                  </p>
                ))}
              </div>
              <div className="p-3">
                <p className="text-xs text-muted-foreground">Tenant</p>
                <p className="font-medium">
                  {partyDisplayName(tenantParty) || "—"}{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({tenantParty.party_type === "organisation" ? tenantParty.org_type || "organisation" : "individual"})
                  </span>
                </p>
              </div>
              <div className="p-3">
                <p className="text-xs text-muted-foreground">Property</p>
                <p className="font-medium">{property?.name || "—"}</p>
              </div>
              <div className="p-3 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Rent / month</p>
                  <p className="font-medium">{formatINR(tenant.monthly_rent || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Term</p>
                  <p className="font-medium">{termLabel(termMonths)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Deposit</p>
                  <p className="font-medium">{formatINR(tenant.security_deposit || 0)}</p>
                </div>
              </div>
            </div>

            <Alert className="border-primary/30 bg-primary/5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs">
                Aadhaar numbers are used only for this document and are <strong>not saved</strong>. Everything
                else is saved so it fills itself in next time (e.g. renewals).
              </AlertDescription>
            </Alert>

            {missing.length > 0 && (
              <Alert variant="default" className="border-warning/40 bg-warning/5">
                <AlertDescription>
                  <p className="text-xs font-medium mb-1">
                    These are blank and will show as a blank line in the document (you can still generate):
                  </p>
                  <ul className="list-disc list-inside text-xs space-y-0.5">
                    {missing.map((f) => (<li key={f}>{f}</li>))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rent Agreement — {tenant.name}</DialogTitle>
        </DialogHeader>

        {/* progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{STEPS[step]}</span>
            <span className="text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        <datalist id="rk-org-types">
          {ORG_TYPE_SUGGESTIONS.map((o) => (<option key={o} value={o} />))}
        </datalist>

        <div className="py-2 min-h-[240px]">{stepBody()}</div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => s - 1))}
            disabled={generating}
          >
            {step === 0 ? "Cancel" : (<><ChevronLeft className="h-4 w-4 mr-1" /> Back</>)}
          </Button>
          {isLast ? (
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
              Generate Word file
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateRentAgreementDialog;
