import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OnboardingState {
  loading: boolean;
  tourCompleted: boolean;
  tourSkipped: boolean;
  userId: string | null;
}

export const useOnboarding = () => {
  const [state, setState] = useState<OnboardingState>({
    loading: true,
    tourCompleted: false,
    tourSkipped: false,
    userId: null,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id ?? null;
      if (!uid) {
        if (mounted) setState({ loading: false, tourCompleted: false, tourSkipped: false, userId: null });
        return;
      }
      const { data } = await supabase
        .from("user_onboarding")
        .select("tour_completed, tour_skipped")
        .eq("user_id", uid)
        .maybeSingle();
      if (mounted) {
        setState({
          loading: false,
          tourCompleted: !!data?.tour_completed,
          tourSkipped: !!data?.tour_skipped,
          userId: uid,
        });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const markTour = useCallback(async (patch: { tour_completed?: boolean; tour_skipped?: boolean }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return;
    await supabase
      .from("user_onboarding")
      .upsert({ user_id: uid, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setState((s) => ({ ...s, ...(patch.tour_completed !== undefined ? { tourCompleted: patch.tour_completed } : {}), ...(patch.tour_skipped !== undefined ? { tourSkipped: patch.tour_skipped } : {}) }));
  }, []);

  return { ...state, markTour };
};
