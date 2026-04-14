import { CheckCircle, Clock, AlertCircle, FileText } from "lucide-react";

export const paymentStatusConfig: Record<string, { icon: typeof CheckCircle; variant: "glow" | "secondary" | "destructive" }> = {
  paid: { icon: CheckCircle, variant: "glow" },
  pending: { icon: Clock, variant: "secondary" },
  overdue: { icon: AlertCircle, variant: "destructive" },
  partial: { icon: Clock, variant: "secondary" },
};

export const invoiceStatusConfig: Record<string, { icon: typeof CheckCircle; variant: "glow" | "secondary" | "destructive" | "outline" }> = {
  draft: { icon: FileText, variant: "outline" },
  sent: { icon: Clock, variant: "secondary" },
  paid: { icon: CheckCircle, variant: "glow" },
  overdue: { icon: AlertCircle, variant: "destructive" },
  cancelled: { icon: FileText, variant: "secondary" },
};
