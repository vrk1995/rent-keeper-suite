import { Loader2, History } from "lucide-react";
import { useActivityLog, ActivityEntityType } from "@/hooks/useActivityLog";
import { formatIST } from "@/lib/dateFormat";

interface ActivityLogListProps {
  entityType: ActivityEntityType;
  entityId?: string;
  emptyLabel?: string;
}

// Internal/bookkeeping fields that aren't meaningful to a human reading the history.
const HIDDEN_FIELDS = new Set(["id", "workspace_id", "created_at", "updated_at"]);

const prettifyFieldName = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const actionLabel: Record<string, string> = {
  insert: "Created",
  update: "Updated",
  delete: "Deleted",
};

export const ActivityLogList = ({ entityType, entityId, emptyLabel }: ActivityLogListProps) => {
  const { data: entries, isLoading } = useActivityLog(entityType, entityId);

  if (isLoading) {
    return (
      <div className="py-6 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        {emptyLabel || "No activity recorded yet."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const actorLabel = entry.changed_by_name || (entry.changed_by ? "Unknown user" : "System");
        const fields = Object.entries(entry.changes || {}).filter(([key]) => !HIDDEN_FIELDS.has(key));

        return (
          <div key={entry.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-medium flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-muted-foreground" />
                {actionLabel[entry.action] || entry.action} by {actorLabel}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">{formatIST(entry.created_at)}</span>
            </div>
            {fields.length > 0 && (
              <div className="space-y-1 pl-5">
                {fields.map(([key, value]) => {
                  if (entry.action === "update" && value && typeof value === "object" && "old" in value && "new" in value) {
                    const { old: oldVal, new: newVal } = value as { old: unknown; new: unknown };
                    return (
                      <p key={key} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{prettifyFieldName(key)}:</span>{" "}
                        {formatValue(oldVal)} → {formatValue(newVal)}
                      </p>
                    );
                  }
                  return (
                    <p key={key} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{prettifyFieldName(key)}:</span>{" "}
                      {formatValue(value)}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
