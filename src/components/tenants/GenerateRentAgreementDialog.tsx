import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileDown, Loader2, Plus, Trash2, ShieldCheck } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const RELATION_OPTIONS = [
  { value: "son", label: "Son of (Father's name)" },
  { value: "daughter", label: "Daughter of (Father's name)" },
  { value: "wife", label: "Wife of (Husband's name)" },
  { value: "husband", label: "Husband of (Wife's name)" },
];

const relationNameLabel = (type: string): string => {
  switch (type) {
    case "wife":
      return "Husband's Name";
    case "husband":
      return "Wife's Name";
    default:
      return "Father's Name";
  }
};

// Aadhaar is collected transiently and NEVER written to our database (Aadhaar Act / DPDP
// data-minimisation). It lives only in this component's state and is passed to the edge
// function to fill the document, then discarded when the dialog closes.
const emptyLandlord = (): AgreementLandlord => ({
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
});

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

  const [template, setTemplate] = useState<AgreementTemplate>("license");
  const [generating, setGenerating] = useState(false);

  // Landlords (stored, minus Aadhaar) + their transient Aadhaar values, indexed in parallel.
  const [landlords, setLandlords] = useState<AgreementLandlord[]>([emptyLandlord()]);
  const [landlordAadhaars, setLandlordAadhaars] = useState<string[]>([""]);

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

  const [tenantFields, setTenantFields] = useState({
    signatory_name: "",
    relation_type: "son",
    relation_name: "",
    signatory_age: "",
    signatory_occupation: "",
    signatory_designation: "",
    bill_to_pan: "",
    permanent_address: "",
    purpose_of_use: "",
    notice_period_months: "1",
    lock_in_period_months: "",
    rent_escalation_percent: "",
    rent_escalation_frequency_years: "",
    renewal_terms: "",
    minor_maintenance_by: "tenant",
    major_maintenance_by: "landlord",
  });
  const [tenantAadhaar, setTenantAadhaar] = useState("");

  useEffect(() => {
    if (!open || !tenant) return;
    setTemplate((tenant.agreement_template as AgreementTemplate) || "license");

    // Landlords: use the property's saved list if present, else seed one from the tenant's
    // billing details so the common single-landlord case is pre-filled.
    const saved = (property?.agreement_landlords as unknown as AgreementLandlord[] | null) || null;
    if (saved && saved.length > 0) {
      setLandlords(saved.map((l) => ({ ...emptyLandlord(), ...l })));
      setLandlordAadhaars(saved.map(() => ""));
    } else {
      const seeded: AgreementLandlord = {
        ...emptyLandlord(),
        entity_name: tenant.bill_from_name || billingAddress?.name || "",
        address: tenant.bill_from_address || billingAddress?.address || "",
        gstin: tenant.bill_from_gstin || billingAddress?.gstin || "",
        pan: tenant.bill_from_pan || billingAddress?.pan || "",
      };
      setLandlords([seeded]);
      setLandlordAadhaars([""]);
    }

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
    setTenantFields({
      signatory_name: tenant.signatory_name || "",
      relation_type: tenant.signatory_relation_type || "son",
      relation_name: tenant.signatory_relation_name || "",
      signatory_age: tenant.signatory_age?.toString() || "",
      signatory_occupation: tenant.signatory_occupation || "",
      signatory_designation: tenant.signatory_designation || "",
      bill_to_pan: tenant.bill_to_pan || "",
      permanent_address: tenant.permanent_address || "",
      purpose_of_use: tenant.purpose_of_use || "",
      notice_period_months: tenant.notice_period_months?.toString() || "1",
      lock_in_period_months: tenant.lock_in_period_months?.toString() || "",
      rent_escalation_percent: tenant.rent_escalation_percent?.toString() || "",
      rent_escalation_frequency_years: tenant.rent_escalation_frequency_years?.toString() || "",
      renewal_terms: tenant.renewal_terms || "",
      minor_maintenance_by: tenant.minor_maintenance_by || "tenant",
      major_maintenance_by: tenant.major_maintenance_by || "landlord",
    });
    setTenantAadhaar("");
  }, [open, tenant, property, billingAddress]);

  const setLandlord = (index: number, patch: Partial<AgreementLandlord>) => {
    setLandlords((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  const addLandlord = () => {
    setLandlords((prev) => [...prev, emptyLandlord()]);
    setLandlordAadhaars((prev) => [...prev, ""]);
  };
  const removeLandlord = (index: number) => {
    setLandlords((prev) => prev.filter((_, i) => i !== index));
    setLandlordAadhaars((prev) => prev.filter((_, i) => i !== index));
  };

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    landlords.forEach((l, i) => {
      const who = landlords.length > 1 ? `Landlord ${i + 1}` : "Landlord";
      if (!l.signatory_name) missing.push(`${who} signatory name`);
      if (!l.relation_name) missing.push(`${who} ${relationNameLabel(l.relation_type).toLowerCase()}`);
    });
    if (!property) {
      missing.push("Property legal description — tenant has no linked property");
    } else {
      if (!propertyFields.survey_number) missing.push("Survey number");
      if (!propertyFields.village) missing.push("Village");
      if (!propertyFields.door_number) missing.push("Door number");
      if (!propertyFields.boundary_north || !propertyFields.boundary_south || !propertyFields.boundary_east || !propertyFields.boundary_west) {
        missing.push("Property boundaries (N/S/E/W)");
      }
    }
    if (!tenantFields.signatory_name) missing.push("Tenant signatory name");
    if (!tenantFields.relation_name) missing.push(`Tenant ${relationNameLabel(tenantFields.relation_type).toLowerCase()}`);
    if (!tenantFields.permanent_address) missing.push("Tenant permanent address");
    if (!tenantFields.purpose_of_use) missing.push("Purpose of use");
    return missing;
  }, [landlords, property, propertyFields, tenantFields]);

  const handleGenerate = async () => {
    if (!tenant) return;
    setGenerating(true);
    try {
      // Persist the reusable (non-Aadhaar) details back to their owning tables.
      if (property) {
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
          agreement_landlords: landlords as unknown as Json,
        });
      }
      await updateTenant.mutateAsync({
        id: tenant.id,
        agreement_template: template,
        signatory_name: tenantFields.signatory_name || null,
        signatory_relation_type: tenantFields.relation_type || null,
        signatory_relation_name: tenantFields.relation_name || null,
        signatory_age: tenantFields.signatory_age ? Number(tenantFields.signatory_age) : null,
        signatory_occupation: tenantFields.signatory_occupation || null,
        signatory_designation: tenantFields.signatory_designation || null,
        bill_to_pan: tenantFields.bill_to_pan || null,
        permanent_address: tenantFields.permanent_address || null,
        purpose_of_use: tenantFields.purpose_of_use || null,
        notice_period_months: tenantFields.notice_period_months ? Number(tenantFields.notice_period_months) : null,
        lock_in_period_months: tenantFields.lock_in_period_months ? Number(tenantFields.lock_in_period_months) : null,
        rent_escalation_percent: tenantFields.rent_escalation_percent ? Number(tenantFields.rent_escalation_percent) : null,
        rent_escalation_frequency_years: tenantFields.rent_escalation_frequency_years ? Number(tenantFields.rent_escalation_frequency_years) : null,
        renewal_terms: tenantFields.renewal_terms || null,
        minor_maintenance_by: tenantFields.minor_maintenance_by || null,
        major_maintenance_by: tenantFields.major_maintenance_by || null,
      });

      // Aadhaar values travel only in this request body — never saved to the DB.
      const { data, error } = await supabase.functions.invoke("generate-rent-agreement", {
        body: {
          tenantId: tenant.id,
          template,
          landlordAadhaars,
          tenantAadhaar,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Rent Agreement — {tenant.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Agreement Type</Label>
            <RadioGroup value={template} onValueChange={(v) => setTemplate(v as AgreementTemplate)} className="grid grid-cols-1 gap-2">
              <Label
                htmlFor="tmpl-license"
                className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer [&:has(:checked)]:border-primary"
              >
                <RadioGroupItem value="license" id="tmpl-license" className="mt-1" />
                <span>
                  <span className="font-medium block">License Agreement</span>
                  <span className="text-xs text-muted-foreground">
                    Short-form leave &amp; license, renewable term, security deposit. Best for shops/offices on shorter terms.
                  </span>
                </span>
              </Label>
              <Label
                htmlFor="tmpl-lease"
                className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer [&:has(:checked)]:border-primary"
              >
                <RadioGroupItem value="lease_deed" id="tmpl-lease" className="mt-1" />
                <span>
                  <span className="font-medium block">Lease Deed</span>
                  <span className="text-xs text-muted-foreground">
                    Longer-form registered lease with a rent escalation schedule, indemnity and force majeure clauses. Best for longer-term tenants.
                  </span>
                </span>
              </Label>
            </RadioGroup>
          </div>

          <Alert className="border-primary/30 bg-primary/5">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <AlertDescription className="text-xs">
              Aadhaar numbers are used only to fill this document and are <strong>not saved</strong> to
              the app. Every other detail below is stored so it auto-fills next time (e.g. renewals).
            </AlertDescription>
          </Alert>

          {missingFields.length > 0 && (
            <Alert variant="default" className="border-warning/40 bg-warning/5">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription>
                <p className="font-medium mb-1">
                  {missingFields.length} field{missingFields.length === 1 ? "" : "s"} not filled in — these will be left blank in the document:
                </p>
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  {missingFields.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Accordion type="multiple" defaultValue={["landlords", "tenant"]} className="w-full">
            <AccordionItem value="landlords">
              <AccordionTrigger>
                Landlord{landlords.length > 1 ? "s" : ""} (Licensor / Lessor)
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-1">
                {landlords.map((l, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Landlord {i + 1}</span>
                      {landlords.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove landlord"
                          onClick={() => removeLandlord(i)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Entity / Firm Name</Label>
                      <Input
                        placeholder="e.g., Acme Properties Pvt Ltd (or the owner's name)"
                        value={l.entity_name}
                        onChange={(e) => setLandlord(i, { entity_name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Signatory Name</Label>
                        <Input
                          placeholder="e.g., John Doe"
                          value={l.signatory_name}
                          onChange={(e) => setLandlord(i, { signatory_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Designation</Label>
                        <Input
                          placeholder="e.g., Managing Partner"
                          value={l.designation}
                          onChange={(e) => setLandlord(i, { designation: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Relation</Label>
                        <Select value={l.relation_type} onValueChange={(val) => setLandlord(i, { relation_type: val })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RELATION_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{relationNameLabel(l.relation_type)}</Label>
                        <Input
                          placeholder="e.g., Richard Doe"
                          value={l.relation_name}
                          onChange={(e) => setLandlord(i, { relation_name: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Age</Label>
                        <Input type="number" min={0} value={l.age} onChange={(e) => setLandlord(i, { age: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Occupation</Label>
                        <Input placeholder="e.g., Business" value={l.occupation} onChange={(e) => setLandlord(i, { occupation: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Address</Label>
                      <Textarea rows={2} value={l.address} onChange={(e) => setLandlord(i, { address: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>GSTIN</Label>
                        <Input maxLength={15} value={l.gstin} onChange={(e) => setLandlord(i, { gstin: e.target.value.toUpperCase() })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>PAN</Label>
                        <Input maxLength={10} value={l.pan} onChange={(e) => setLandlord(i, { pan: e.target.value.toUpperCase() })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        Aadhaar Number <span className="text-[10px] text-muted-foreground font-normal">(not saved)</span>
                      </Label>
                      <Input
                        maxLength={14}
                        placeholder="Optional — used for the document only"
                        value={landlordAadhaars[i] || ""}
                        onChange={(e) =>
                          setLandlordAadhaars((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))
                        }
                      />
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addLandlord}>
                  <Plus className="h-4 w-4 mr-1" /> Add Another Landlord
                </Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="property">
              <AccordionTrigger>Property Legal Description</AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1">
                {!property ? (
                  <p className="text-sm text-muted-foreground">This tenant isn't linked to a property.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Survey Number</Label>
                        <Input value={propertyFields.survey_number} onChange={(e) => setPropertyFields({ ...propertyFields, survey_number: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Sub-division Number</Label>
                        <Input value={propertyFields.sub_division_number} onChange={(e) => setPropertyFields({ ...propertyFields, sub_division_number: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label>Village/Desom</Label>
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
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Municipal Door Number</Label>
                        <Input value={propertyFields.door_number} onChange={(e) => setPropertyFields({ ...propertyFields, door_number: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Undivided Land Share</Label>
                        <Input placeholder="e.g., 1000/50000 share in 10 Ares" value={propertyFields.undivided_share} onChange={(e) => setPropertyFields({ ...propertyFields, undivided_share: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Bounded North by</Label>
                        <Input value={propertyFields.boundary_north} onChange={(e) => setPropertyFields({ ...propertyFields, boundary_north: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Bounded South by</Label>
                        <Input value={propertyFields.boundary_south} onChange={(e) => setPropertyFields({ ...propertyFields, boundary_south: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Bounded East by</Label>
                        <Input value={propertyFields.boundary_east} onChange={(e) => setPropertyFields({ ...propertyFields, boundary_east: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Bounded West by</Label>
                        <Input value={propertyFields.boundary_west} onChange={(e) => setPropertyFields({ ...propertyFields, boundary_west: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Building Tax Paid By</Label>
                      <Select value={propertyFields.building_tax_by} onValueChange={(v) => setPropertyFields({ ...propertyFields, building_tax_by: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="landlord">Landlord</SelectItem>
                          <SelectItem value="tenant">Tenant</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tenant">
              <AccordionTrigger>Tenant (Licensee / Lessee)</AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Signatory Name</Label>
                    <Input
                      placeholder="e.g., Jane Doe"
                      value={tenantFields.signatory_name}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Designation</Label>
                    <Input
                      placeholder="e.g., Proprietor / Director"
                      value={tenantFields.signatory_designation}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_designation: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Relation</Label>
                    <Select value={tenantFields.relation_type} onValueChange={(v) => setTenantFields({ ...tenantFields, relation_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RELATION_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{relationNameLabel(tenantFields.relation_type)}</Label>
                    <Input
                      placeholder="e.g., Richard Doe"
                      value={tenantFields.relation_name}
                      onChange={(e) => setTenantFields({ ...tenantFields, relation_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Age</Label>
                    <Input
                      type="number"
                      min={0}
                      value={tenantFields.signatory_age}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_age: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Occupation</Label>
                    <Input
                      placeholder="e.g., Business"
                      value={tenantFields.signatory_occupation}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_occupation: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>PAN</Label>
                    <Input
                      maxLength={10}
                      value={tenantFields.bill_to_pan}
                      onChange={(e) => setTenantFields({ ...tenantFields, bill_to_pan: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      Aadhaar Number <span className="text-[10px] text-muted-foreground font-normal">(not saved)</span>
                    </Label>
                    <Input
                      maxLength={14}
                      placeholder="Optional — used for the document only"
                      value={tenantAadhaar}
                      onChange={(e) => setTenantAadhaar(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Permanent / Registered Address</Label>
                  <Textarea
                    rows={2}
                    value={tenantFields.permanent_address}
                    onChange={(e) => setTenantFields({ ...tenantFields, permanent_address: e.target.value })}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="terms">
              <AccordionTrigger>Lease Terms</AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label>Purpose of Use</Label>
                  <Textarea
                    rows={2}
                    placeholder="e.g., running a retail business"
                    value={tenantFields.purpose_of_use}
                    onChange={(e) => setTenantFields({ ...tenantFields, purpose_of_use: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Notice Period (months)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={tenantFields.notice_period_months}
                      onChange={(e) => setTenantFields({ ...tenantFields, notice_period_months: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lock-in Period (months)</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Optional"
                      value={tenantFields.lock_in_period_months}
                      onChange={(e) => setTenantFields({ ...tenantFields, lock_in_period_months: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Rent Escalation (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g., 15"
                      value={tenantFields.rent_escalation_percent}
                      onChange={(e) => setTenantFields({ ...tenantFields, rent_escalation_percent: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Escalation Every (years)</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g., 3"
                      value={tenantFields.rent_escalation_frequency_years}
                      onChange={(e) => setTenantFields({ ...tenantFields, rent_escalation_frequency_years: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Minor Maintenance By</Label>
                    <Select value={tenantFields.minor_maintenance_by} onValueChange={(v) => setTenantFields({ ...tenantFields, minor_maintenance_by: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tenant">Tenant</SelectItem>
                        <SelectItem value="landlord">Landlord</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Major Maintenance By</Label>
                    <Select value={tenantFields.major_maintenance_by} onValueChange={(v) => setTenantFields({ ...tenantFields, major_maintenance_by: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="landlord">Landlord</SelectItem>
                        <SelectItem value="tenant">Tenant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Renewal Terms (optional)</Label>
                  <Textarea
                    rows={2}
                    placeholder="Leave blank to use the template's standard renewal clause"
                    value={tenantFields.renewal_terms}
                    onChange={(e) => setTenantFields({ ...tenantFields, renewal_terms: e.target.value })}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4 mr-2" />
            )}
            Save &amp; Generate .docx
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateRentAgreementDialog;
