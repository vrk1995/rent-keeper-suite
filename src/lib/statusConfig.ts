import { CheckCircle, Clock, AlertCircle, FileText } from "lucide-react";

export const paymentStatusConfig: Record<string, { icon: typeof CheckCircle; variant: "success" | "secondary" | "destructive" }> = {
  paid: { icon: CheckCircle, variant: "success" },
  pending: { icon: Clock, variant: "secondary" },
  overdue: { icon: AlertCircle, variant: "destructive" },
  partial: { icon: Clock, variant: "secondary" },
};

export const invoiceStatusConfig: Record<string, { icon: typeof CheckCircle; variant: "success" | "secondary" | "destructive" | "outline" }> = {
  draft: { icon: FileText, variant: "outline" },
  sent: { icon: Clock, variant: "secondary" },
  paid: { icon: CheckCircle, variant: "success" },
  overdue: { icon: AlertCircle, variant: "destructive" },
  cancelled: { icon: FileText, variant: "secondary" },
};

export const occupancyStatusConfig: Record<string, "success" | "secondary" | "destructive"> = {
  occupied: "success",
  vacant: "secondary",
  partial: "secondary",
  maintenance: "destructive",
};
