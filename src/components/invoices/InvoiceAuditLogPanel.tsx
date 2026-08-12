import { useMemo, useState } from "react";
import { History, Loader2, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  useWorkspaceInvoiceGenerationLog,
  sourceLabel,
  outcomeLabel,
} from "@/hooks/useInvoiceGenerationLog";
import { formatIST } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";

const outcomeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  created: "default",
  reused: "secondary",
  blocked: "outline",
  failed: "destructive",
};

/** Workspace-wide invoice generation audit trail with source and actor filters. */
export const InvoiceAuditLogPanel = () => {
  const [open, setOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { data: entries, isLoading } = useWorkspaceInvoiceGenerationLog(open);

  const actorOptions = useMemo(() => {
    const names = new Set<string>();
    entries?.forEach((e) => names.add(e.triggered_by_name || "Scheduled job"));
    return Array.from(names).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (entries || []).filter((e) => {
      const actor = e.triggered_by_name || "Scheduled job";
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (actorFilter !== "all" && actor !== actorFilter) return false;
      if (outcomeFilter !== "all" && e.outcome !== outcomeFilter) return false;
      if (
        query &&
        !(e.invoice_number || "").toLowerCase().includes(query) &&
        !(e.reason || "").toLowerCase().includes(query) &&
        !actor.toLowerCase().includes(query)
      )
        return false;
      return true;
    });
  }, [entries, sourceFilter, actorFilter, outcomeFilter, search]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-3 py-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              Invoice generation audit trail
            </CardTitle>
            <ChevronDown
              className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <Input
                placeholder="Search invoice #, actor, reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-64"
              />
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="cron">Scheduled job</SelectItem>
                  <SelectItem value="preview">Preview</SelectItem>
                  <SelectItem value="manual">Manual action</SelectItem>
                </SelectContent>
              </Select>
              <Select value={actorFilter} onValueChange={setActorFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Actor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actors</SelectItem>
                  {actorOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outcomes</SelectItem>
                  <SelectItem value="created">Invoice created</SelectItem>
                  <SelectItem value="reused">Existing invoice re-opened</SelectItem>
                  <SelectItem value="blocked">Blocked (not due yet)</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              {(sourceFilter !== "all" || actorFilter !== "all" || outcomeFilter !== "all" || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSourceFilter("all");
                    setActorFilter("all");
                    setOutcomeFilter("all");
                    setSearch("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">No generation events match these filters.</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-border rounded-lg border border-border">
                {filtered.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-3 py-2.5 text-xs"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <Badge variant={outcomeVariant[e.outcome] || "secondary"} className="shrink-0">
                        {outcomeLabel[e.outcome] || e.outcome}
                      </Badge>
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">
                          {e.invoice_number || "No invoice number"}
                        </span>{" "}
                        via {sourceLabel[e.source] || e.source} by{" "}
                        {e.triggered_by_name || "Scheduled job"}
                        {e.reason ? (
                          <span className="block text-muted-foreground">{e.reason}</span>
                        ) : null}
                      </span>
                    </div>
                    <span className="text-muted-foreground shrink-0">{formatIST(e.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
