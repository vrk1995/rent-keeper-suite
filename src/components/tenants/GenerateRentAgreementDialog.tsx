import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileDown, Loader2 } from "lucide-react";
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
import { useProperties, useUpdateProperty } from "@/hooks/useProperties";
import { useBillingAddresses, useUpdateBillingAddress } from "@/hooks/useBillingAddresses";
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

const GenerateRentAgreementDialog = ({ tenant, open, onOpenChange }: GenerateRentAgreementDialogProps) => {
  const { data: properties } = useProperties();
  const { data: billingAddresses } = useBillingAddresses();
  const updateTenant = useUpdateTenant();
  const updateProperty = useUpdateProperty();
  const updateBillingAddress = useUpdateBillingAddress();

  const property = useMemo(
    () => properties?.find((p) => p.id === tenant?.property_id) || null,
    [properties, tenant?.property_id]
  );
  // billing_addresses isn't a live FK from the tenant — tenant.bill_from_* are copies taken
  // at selection time — so resolve the matching row by name the same way invoice generation does.
  const billingAddress = useMemo(
    () => billingAddresses?.find((a) => a.name === tenant?.bill_from_name) || null,
    [billingAddresses, tenant?.bill_from_name]
  );

  const [template, setTemplate] = useState<AgreementTemplate>("license");
  const [generating, setGenerating] = useState(false);

  // Landlord (billing address) signatory fields
  const [landlord, setLandlord] = useState({
    signatory_name: "",
    signatory_relation: "",
    signatory_age: "",
    signatory_occupation: "",
    signatory_designation: "",
    signatory_aadhaar: "",
  });

  // Property legal description fields
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

  // Tenant signatory + lease term fields
  const [tenantFields, setTenantFields] = useState({
    signatory_name: "",
    signatory_relation: "",
    signatory_age: "",
    signatory_occupation: "",
    signatory_designation: "",
    signatory_aadhaar: "",
    permanent_address: "",
    bill_to_pan: "",
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
    setTemplate((tenant.agreement_template as AgreementTemplate) || "license");
    setLandlord({
      signatory_name: billingAddress?.signatory_name || "",
      signatory_relation: billingAddress?.signatory_relation || "",
      signatory_age: billingAddress?.signatory_age?.toString() || "",
      signatory_occupation: billingAddress?.signatory_occupation || "",
      signatory_designation: billingAddress?.signatory_designation || "",
      signatory_aadhaar: billingAddress?.signatory_aadhaar || "",
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
    setTenantFields({
      signatory_name: tenant.signatory_name || "",
      signatory_relation: tenant.signatory_relation || "",
      signatory_age: tenant.signatory_age?.toString() || "",
      signatory_occupation: tenant.signatory_occupation || "",
      signatory_designation: tenant.signatory_designation || "",
      signatory_aadhaar: tenant.signatory_aadhaar || "",
      permanent_address: tenant.permanent_address || "",
      bill_to_pan: tenant.bill_to_pan || "",
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

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!billingAddress) {
      missing.push("Landlord identity — no billing address matches this tenant's billing name");
    } else {
      if (!landlord.signatory_name) missing.push("Landlord signatory name");
      if (!landlord.signatory_relation) missing.push("Landlord S/o, W/o or D/o");
      if (!landlord.signatory_aadhaar) missing.push("Landlord Aadhaar number");
    }
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
    if (!tenantFields.signatory_relation) missing.push("Tenant S/o, W/o or D/o");
    if (!tenantFields.signatory_aadhaar) missing.push("Tenant Aadhaar number");
    if (!tenantFields.permanent_address) missing.push("Tenant permanent address");
    if (!tenantFields.purpose_of_use) missing.push("Purpose of use");
    return missing;
  }, [billingAddress, property, landlord, propertyFields, tenantFields]);

  const handleGenerate = async () => {
    if (!tenant) return;
    setGenerating(true);
    try {
      // Persist edits back to their owning tables so they're pre-filled next time.
      if (billingAddress) {
        await updateBillingAddress.mutateAsync({
          id: billingAddress.id,
          signatory_name: landlord.signatory_name || null,
          signatory_relation: landlord.signatory_relation || null,
          signatory_age: landlord.signatory_age ? Number(landlord.signatory_age) : null,
          signatory_occupation: landlord.signatory_occupation || null,
          signatory_designation: landlord.signatory_designation || null,
          signatory_aadhaar: landlord.signatory_aadhaar || null,
        });
      }
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
        });
      }
      await updateTenant.mutateAsync({
        id: tenant.id,
        agreement_template: template,
        signatory_name: tenantFields.signatory_name || null,
        signatory_relation: tenantFields.signatory_relation || null,
        signatory_age: tenantFields.signatory_age ? Number(tenantFields.signatory_age) : null,
        signatory_occupation: tenantFields.signatory_occupation || null,
        signatory_designation: tenantFields.signatory_designation || null,
        signatory_aadhaar: tenantFields.signatory_aadhaar || null,
        permanent_address: tenantFields.permanent_address || null,
        bill_to_pan: tenantFields.bill_to_pan || null,
        purpose_of_use: tenantFields.purpose_of_use || null,
        notice_period_months: tenantFields.notice_period_months ? Number(tenantFields.notice_period_months) : null,
        lock_in_period_months: tenantFields.lock_in_period_months ? Number(tenantFields.lock_in_period_months) : null,
        rent_escalation_percent: tenantFields.rent_escalation_percent ? Number(tenantFields.rent_escalation_percent) : null,
        rent_escalation_frequency_years: tenantFields.rent_escalation_frequency_years ? Number(tenantFields.rent_escalation_frequency_years) : null,
        renewal_terms: tenantFields.renewal_terms || null,
        minor_maintenance_by: tenantFields.minor_maintenance_by || null,
        major_maintenance_by: tenantFields.major_maintenance_by || null,
      });

      const { data, error } = await supabase.functions.invoke("generate-rent-agreement", {
        body: { tenantId: tenant.id, template },
      });
      if (error) throw error;

      downloadBase64File(data.docx, data.filename || "Rent-Agreement.docx", DOCX_MIME);
      toast.success("Rent agreement generated!");
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to generate agreement: " + error.message);
    } finally {
      setGenerating(false);
    }
  };

  if (!tenant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
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

          <Accordion type="multiple" defaultValue={["landlord", "tenant"]} className="w-full">
            <AccordionItem value="landlord">
              <AccordionTrigger>Landlord (Licensor / Lessor) Details</AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1">
                {!billingAddress ? (
                  <p className="text-sm text-muted-foreground">
                    No billing address matches this tenant's "Bill From" name ({tenant.bill_from_name || "—"}).
                    Fix the tenant's billing details first so these can be saved.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Signatory Name</Label>
                        <Input
                          placeholder="e.g., Mr. P N Balakrishnan"
                          value={landlord.signatory_name}
                          onChange={(e) => setLandlord({ ...landlord, signatory_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Designation</Label>
                        <Input
                          placeholder="e.g., Managing Partner"
                          value={landlord.signatory_designation}
                          onChange={(e) => setLandlord({ ...landlord, signatory_designation: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>S/o, W/o or D/o</Label>
                        <Input
                          placeholder="e.g., S/o Mr. Narayana Kamath"
                          value={landlord.signatory_relation}
                          onChange={(e) => setLandlord({ ...landlord, signatory_relation: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Age</Label>
                        <Input
                          type="number"
                          min={0}
                          value={landlord.signatory_age}
                          onChange={(e) => setLandlord({ ...landlord, signatory_age: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Occupation</Label>
                        <Input
                          value={landlord.signatory_occupation}
                          onChange={(e) => setLandlord({ ...landlord, signatory_occupation: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Aadhaar Number</Label>
                        <Input
                          maxLength={14}
                          value={landlord.signatory_aadhaar}
                          onChange={(e) => setLandlord({ ...landlord, signatory_aadhaar: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}
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
                        <Input placeholder="e.g., 14494/77200 in 7.28 Ares" value={propertyFields.undivided_share} onChange={(e) => setPropertyFields({ ...propertyFields, undivided_share: e.target.value })} />
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
              <AccordionTrigger>Tenant (Licensee / Lessee) Details</AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Signatory Name</Label>
                    <Input
                      placeholder="e.g., Mr. A K Shaji"
                      value={tenantFields.signatory_name}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Designation</Label>
                    <Input
                      placeholder="e.g., Managing Partner, Proprietor"
                      value={tenantFields.signatory_designation}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_designation: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>S/o, W/o or D/o</Label>
                    <Input
                      value={tenantFields.signatory_relation}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_relation: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Age</Label>
                    <Input
                      type="number"
                      min={0}
                      value={tenantFields.signatory_age}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_age: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Occupation</Label>
                    <Input
                      value={tenantFields.signatory_occupation}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_occupation: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Aadhaar Number</Label>
                    <Input
                      maxLength={14}
                      value={tenantFields.signatory_aadhaar}
                      onChange={(e) => setTenantFields({ ...tenantFields, signatory_aadhaar: e.target.value })}
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
                    placeholder="e.g., running a business of sales and service of mobile phones, laptops and accessories"
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
