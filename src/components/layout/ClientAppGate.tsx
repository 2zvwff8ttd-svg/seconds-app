"use client";

import { OpeningOverlay } from "@/components/opening/OpeningOverlay";
import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";
import { isPublicRoute } from "@/lib/auth/routes";
import { isOnboardingComplete } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type GatePhase = "loading" | "opening" | "onboarding" | "ready";

export function ClientAppGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicRoute = isPublicRoute(pathname);
  const [phase, setPhase] = useState<GatePhase>(publicRoute ? "ready" : "loading");
  const needsOnboardingRef = useRef(false);

  const evaluateGate = useCallback(async () => {
    if (isPublicRoute(pathname)) {
      setPhase("ready");
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setPhase("ready");
      return;
    }

    needsOnboardingRef.current = !isOnboardingComplete(user);
    setPhase("opening");
  }, [pathname]);

  useEffect(() => {
    void evaluateGate();
  }, [evaluateGate]);

  const handleOpeningComplete = useCallback(() => {
    setPhase(needsOnboardingRef.current ? "onboarding" : "ready");
  }, []);

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
      {phase === "opening" && (
        <OpeningOverlay onComplete={handleOpeningComplete} />
      )}
      {phase === "onboarding" && (
        <OnboardingOverlay onComplete={handleOnboardingComplete} />
      )}
    </>
  );
}
