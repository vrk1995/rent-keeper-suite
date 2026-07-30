import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the Supabase session in sync across browser tabs.
 *
 * supabase-js persists the session in localStorage but does not react to
 * changes made by other tabs. So a tab that was opened (or left idle) while
 * another tab refreshed the token can end up holding a stale/rotated refresh
 * token and gets bounced to the login screen. Listening to the `storage`
 * event lets every tab pick up the newest session immediately.
 */
export function useCrossTabAuthSync() {
  useEffect(() => {
    const isAuthKey = (key: string | null) =>
      !!key && key.startsWith("sb-") && key.includes("auth-token");

    const onStorage = async (e: StorageEvent) => {
      if (!isAuthKey(e.key)) return;

      if (!e.newValue) {
        // Signed out in another tab.
        const { data } = await supabase.auth.getSession();
        if (data.session) await supabase.auth.signOut({ scope: "local" });
        return;
      }

      try {
        const parsed = JSON.parse(e.newValue);
        const access_token = parsed?.access_token ?? parsed?.currentSession?.access_token;
        const refresh_token = parsed?.refresh_token ?? parsed?.currentSession?.refresh_token;
        if (!access_token || !refresh_token) return;

        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token === access_token) return;

        await supabase.auth.setSession({ access_token, refresh_token });
      } catch {
        // Ignore malformed payloads.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // Re-read persisted session (and refresh if needed) when the tab wakes up.
        void supabase.auth.getSession();
      }
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
