export interface HelpFeature {
  id: string;
  title: string;
  category: "Setup" | "Daily use" | "Team & billing";
  route: string;
  steps: string[];
}

export const HELP_FEATURES: HelpFeature[] = [
  {
    id: "add-property",
    title: "Add a Property",
    category: "Setup",
    route: "/dashboard/properties",
    steps: [
      "Open the Properties page from the left sidebar.",
      "Click the 'Add Property' button in the top-right.",
      "Fill in the name, address, total sqft and assign an owner.",
      "Save. Your property appears as a card — click it to add floors and units.",
    ],
  },
  {
    id: "add-tenant",
    title: "Add a Tenant",
    category: "Setup",
    route: "/dashboard/tenants",
    steps: [
      "Go to Tenants from the sidebar.",
      "Click 'Add Tenant' in the top-right.",
      "Pick the property and unit(s), then fill in name, contact, rent, rent due day and billing address.",
      "Save — the tenant is now active and their monthly rent will auto-generate.",
    ],
  },
  {
    id: "record-payment",
    title: "Record a Rent Payment",
    category: "Daily use",
    route: "/dashboard/payments",
    steps: [
      "Open the Receipts page.",
      "Find the pending row for the tenant / month.",
      "Click 'Mark Paid', enter the paid date, mode and amount received.",
      "Save — a receipt PDF is generated and the invoice status updates to Paid.",
    ],
  },
  {
    id: "view-invoice",
    title: "Download or View an Invoice",
    category: "Daily use",
    route: "/dashboard/invoices",
    steps: [
      "Open the Invoices page.",
      "Use the filters / sort dropdown to find the invoice you need.",
      "Click the PDF icon on the row — the invoice opens in a new tab.",
      "Invoices are frozen once generated; the number and date do not change.",
    ],
  },
  {
    id: "upload-document",
    title: "Upload a Document",
    category: "Daily use",
    route: "/dashboard/documents",
    steps: [
      "Go to Documents.",
      "Click 'Upload Document'.",
      "Choose the property (and tenant if applicable), pick the file and add a title.",
      "Save — the document is stored securely and available to your team.",
    ],
  },
  {
    id: "set-reminder",
    title: "Set a Reminder",
    category: "Daily use",
    route: "/dashboard/reminders",
    steps: [
      "Open Reminders from the sidebar.",
      "Click 'Add Reminder'.",
      "Enter the title, due date and link it to a property or tenant.",
      "Save — it will appear on your dashboard as the date approaches.",
    ],
  },
  {
    id: "rent-increment",
    title: "Schedule a Rent Increment",
    category: "Setup",
    route: "/dashboard/tenants",
    steps: [
      "Open Tenants and click on the tenant.",
      "In the detail sheet, open the 'Rent Increments' section.",
      "Add a new increment: date, type (% or fixed) and value.",
      "Save — future rent will apply automatically from that date.",
    ],
  },
  {
    id: "invite-team",
    title: "Invite a Team Member",
    category: "Team & billing",
    route: "/dashboard/team",
    steps: [
      "Go to Team.",
      "Click 'Invite Team Member'.",
      "Enter their email, choose a role, and optionally restrict to specific properties.",
      "Send — they receive an email to set a password and join your workspace.",
    ],
  },
  {
    id: "billing-address",
    title: "Add a Billing Address (Bill From)",
    category: "Team & billing",
    route: "/dashboard/billing-addresses",
    steps: [
      "Open Billing from the sidebar.",
      "Click 'Add Billing Address'.",
      "Enter your company name, GSTIN, address, invoice prefix and bank details.",
      "Save — link this address to tenants so their invoices use these details.",
    ],
  },
  {
    id: "filter-owner-fy",
    title: "Filter by Owner or Financial Year",
    category: "Daily use",
    route: "/dashboard",
    steps: [
      "Use the Owner and Financial Year dropdowns in the top header.",
      "Selections apply across Overview, Properties, Tenants, Receipts, Invoices and Reports.",
      "Switch back to 'All Owners' or the current FY at any time.",
    ],
  },
];
