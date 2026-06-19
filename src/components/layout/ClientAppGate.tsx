"use client";

import { OpeningOverlay } from "@/components/opening/OpeningOverlay";
import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";
import { isPublicRoute } from "@/lib/auth/routes";
import {
  hasSeenOpeningQuestionThisSession,
  markOpeningQuestionSeenThisSession,
} from "@/lib/opening/state";
import { isOnboardingComplete } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type GatePhase = "loading" | "opening" | "onboarding" | "ready";

const CLIENT_GET_USER_TIMEOUT_MS = 8_000;

/** Vercel env: NEXT_PUBLIC_SKIP_CLIENT_APP_GATE=1. TEMP: hardcoded skip for diagnosis — revert after test. */
const SKIP_CLIENT_APP_GATE =
  true ||
  process.env.NEXT_PUBLIC_SKIP_CLIENT_APP_GATE === "1";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("ClientAppGate: getUser timed out")),
      ms,
    );
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

export function ClientAppGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicRoute = isPublicRoute(pathname);
  const [phase, setPhase] = useState<GatePhase>(publicRoute ? "ready" : "loading");
  const [homeRevealing, setHomeRevealing] = useState(false);
  const needsOnboardingRef = useRef(false);
  /** オープニングを一度スケジュールしたら、画面遷移では再実行しない */
  const openingScheduledRef = useRef(false);

  useEffect(() => {
    if (isPublicRoute(pathname)) {
      setPhase("ready");
      return;
    }

    if (SKIP_CLIENT_APP_GATE) {
      setPhase("ready");
      return;
    }

    if (hasSeenOpeningQuestionThisSession()) {
      setPhase("ready");
      return;
    }

    if (openingScheduledRef.current) {
      setPhase("ready");
      return;
    }

    openingScheduledRef.current = true;

    const run = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await withTimeout(supabase.auth.getUser(), CLIENT_GET_USER_TIMEOUT_MS);

        if (!user) {
          openingScheduledRef.current = false;
          setPhase("ready");
          return;
        }

        if (hasSeenOpeningQuestionThisSession()) {
          setPhase("ready");
          return;
        }

        needsOnboardingRef.current = !isOnboardingComplete(user);
        setPhase("opening");
      } catch (err) {
        console.warn("[ClientAppGate] auth gate skipped", err);
        openingScheduledRef.current = false;
        setPhase("ready");
      }
    };

    void run();
  }, [pathname]);

  const handleOpeningComplete = useCallback(() => {
    markOpeningQuestionSeenThisSession();
    setPhase(needsOnboardingRef.current ? "onboarding" : "ready");
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setPhase("ready");
  }, []);

  if (publicRoute) {
    return <>{children}</>;
  }

  const showChildren = phase === "opening" || phase === "ready";
  const homeBehindClass =
    phase === "opening" && !homeRevealing
      ? "pointer-events-none scale-[1.05] opacity-0 blur-2xl"
      : "scale-100 opacity-100 blur-0";

  return (
    <>
      {showChildren && (
        <div
          className={`transition-[filter,opacity,transform] duration-700 ease-out ${homeBehindClass}`}
        >
          {children}
        </div>
      )}
      {phase === "loading" && (
        <div className="z-onboarding fixed inset-0 flex items-center justify-center bg-black">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        </div>
      )}
      {phase === "opening" && (
        <OpeningOverlay
          onRevealStart={() => setHomeRevealing(true)}
          onComplete={handleOpeningComplete}
        />
      )}
      {phase === "onboarding" && (
        <OnboardingOverlay onComplete={handleOnboardingComplete} />
      )}
    </>
  );
}
