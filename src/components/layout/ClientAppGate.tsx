"use client";

import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";
import { isPublicRoute } from "@/lib/auth/routes";
import { isOnboardingComplete } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type GatePhase = "loading" | "onboarding" | "ready";

export function ClientAppGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicRoute = isPublicRoute(pathname);
  const [phase, setPhase] = useState<GatePhase>(publicRoute ? "ready" : "loading");

  const evaluateOnboarding = useCallback(async () => {
    if (isPublicRoute(pathname)) {
      setPhase("ready");
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || isOnboardingComplete(user)) {
      setPhase("ready");
      return;
    }

    setPhase("onboarding");
  }, [pathname]);

  useEffect(() => {
    void evaluateOnboarding();
  }, [evaluateOnboarding]);

  const handleOnboardingComplete = useCallback(() => {
    setPhase("ready");
  }, []);

  if (publicRoute) {
    return <>{children}</>;
  }

  return (
    <>
      {phase === "ready" ? children : null}
      {phase === "loading" && (
        <div className="z-onboarding fixed inset-0 flex items-center justify-center bg-black">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        </div>
      )}
      {phase === "onboarding" && (
        <OnboardingOverlay onComplete={handleOnboardingComplete} />
      )}
    </>
  );
}
