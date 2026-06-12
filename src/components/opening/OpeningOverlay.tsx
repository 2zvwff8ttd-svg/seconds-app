"use client";

import {
  OPENING_EXIT_MS,
  OPENING_FP_PASS_MS,
  OPENING_QUESTION_INTRO_MS,
  OPENING_SECONDS_MS,
} from "@/lib/opening/transition";
import {
  hasSeenOpeningSecondsToday,
  markOpeningSecondsSeenToday,
} from "@/lib/opening/state";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { useCallback, useEffect, useState } from "react";
import { OpeningFirstPersonPass } from "./OpeningFirstPersonPass";

type OpeningStep = "question" | "rush" | "seconds" | "exit";

type OpeningOverlayProps = {
  onComplete: () => void;
  onRevealStart?: () => void;
};

export function OpeningOverlay({ onComplete, onRevealStart }: OpeningOverlayProps) {
  const [step, setStep] = useState<OpeningStep>("question");
  const [assignedSeconds, setAssignedSeconds] = useState<number | null>(null);
  const [showSecondsStep, setShowSecondsStep] = useState(false);
  const [secondsReady, setSecondsReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const firstOpenToday = !hasSeenOpeningSecondsToday();
    setShowSecondsStep(firstOpenToday);

    if (!firstOpenToday) {
      setSecondsReady(true);
      return;
    }

    fetchTodayAssignedSeconds()
      .then((seconds) => {
        setAssignedSeconds(seconds);
        setSecondsReady(true);
      })
      .catch((err) => {
        console.warn("[OpeningOverlay] assigned seconds", err);
        setSecondsReady(true);
      });
  }, []);

  const beginExit = useCallback(() => {
    setStep("exit");
  }, []);

  useEffect(() => {
    if (step !== "exit") return;

    onRevealStart?.();
    const timer = window.setTimeout(() => {
      onComplete();
    }, OPENING_EXIT_MS);

    return () => window.clearTimeout(timer);
  }, [step, onComplete, onRevealStart]);

  useEffect(() => {
    if (step !== "question" || !secondsReady) return;

    const duration = reducedMotion ? 800 : OPENING_QUESTION_INTRO_MS;
    const timer = window.setTimeout(() => {
      if (reducedMotion) {
        if (showSecondsStep && assignedSeconds !== null) {
          setStep("seconds");
        } else {
          beginExit();
        }
        return;
      }
      setStep("rush");
    }, duration);

    return () => window.clearTimeout(timer);
  }, [
    step,
    secondsReady,
    reducedMotion,
    showSecondsStep,
    assignedSeconds,
    beginExit,
  ]);

  useEffect(() => {
    if (step !== "rush") return;

    const timer = window.setTimeout(() => {
      if (showSecondsStep && assignedSeconds !== null) {
        setStep("seconds");
        return;
      }
      beginExit();
    }, OPENING_FP_PASS_MS);

    return () => window.clearTimeout(timer);
  }, [step, showSecondsStep, assignedSeconds, beginExit]);

  useEffect(() => {
    if (step !== "seconds") return;

    const timer = window.setTimeout(() => {
      markOpeningSecondsSeenToday();
      beginExit();
    }, OPENING_SECONDS_MS);

    return () => window.clearTimeout(timer);
  }, [step, beginExit]);

  return (
    <div
      className={`z-opening opening-overlay fixed inset-0 flex items-center justify-center bg-[#030208] ${
        step === "exit" ? "opening-overlay--exiting" : ""
      }`}
      role="presentation"
      aria-hidden
    >
      {step === "rush" && <OpeningFirstPersonPass />}

      {step === "question" && (
        <div className="opening-question-intro relative z-10 flex items-center justify-center">
          <div className="opening-question-intro__glow absolute h-36 w-36 rounded-full sm:h-44 sm:w-44" />
          <span className="opening-question-intro__mark relative text-[6.5rem] font-bold leading-none sm:text-[8rem]">
            ?
          </span>
        </div>
      )}

      {step === "seconds" && (
        <div className="opening-seconds-reveal relative z-10 text-center">
          <p className="opening-seconds-glow text-[5.5rem] font-bold leading-none text-violet-300 sm:text-[7rem]">
            {assignedSeconds}
          </p>
          <p className="mt-4 text-lg font-medium tracking-widest text-violet-200/80 sm:text-xl">
            秒
          </p>
          <p className="mt-3 text-sm text-muted">今日の撮影時間</p>
        </div>
      )}
    </div>
  );
}
