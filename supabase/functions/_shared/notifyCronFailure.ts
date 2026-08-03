import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CronFailureItem {
  label: string;
  message: string;
}

/**
 * Fires the "cron-failure-alert" email (see _shared/transactional-email-templates) whenever a
 * scheduled job hits a problem — either it crashed outright, or it ran but failed partway
 * through for one or more items (e.g. one tenant's invoice). Best-effort: a failure sending
 * the alert itself must never break the cron's own response.
 */
export async function notifyCronFailure(
  admin: ReturnType<typeof createClient>,
  params: {
    cronName: string;
    ranAtIso: string;
    topLevelError?: string;
    items?: CronFailureItem[];
  }
): Promise<void> {
  try {
    // Dedupe alerts for the same job within the same hour, so a job that fails on every
    // retry (or every tenant) doesn't flood the inbox with one email per attempt.
    const hourBucket = params.ranAtIso.slice(0, 13);
    const idempotencyKey = `cron-failure-${params.cronName}-${hourBucket}`;

    const { error } = await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "cron-failure-alert",
        idempotencyKey,
        templateData: {
          cronName: params.cronName,
          ranAt: params.ranAtIso,
          topLevelError: params.topLevelError || null,
          items: params.items || [],
        },
      },
    });
    if (error) console.error("Failed to send cron-failure alert email:", error);
  } catch (err) {
    console.error("Failed to send cron-failure alert email:", err);
  }
}
