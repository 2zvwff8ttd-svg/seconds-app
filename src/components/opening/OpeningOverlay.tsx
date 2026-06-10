"use client";

import {
  hasSeenOpeningSecondsToday,
  markOpeningSecondsSeenToday,
} from "@/lib/opening/state";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { useCallback, useEffect, useState } from "react";
import { OpeningFogRush } from "./OpeningFogRush";

const QUESTION_DURATION_MS = 550;
const RUSH_DURATION_MS = 2500;
const SECONDS_DURATION_MS = 2200;
const EXIT_DURATION_MS = 650;

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
    }, EXIT_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [step, onComplete, onRevealStart]);

  useEffect(() => {
    if (step !== "question" || !secondsReady) return;

    const duration = reducedMotion ? 800 : QUESTION_DURATION_MS;
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
    }, RUSH_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [step, showSecondsStep, assignedSeconds, beginExit]);

  useEffect(() => {
    if (step !== "seconds") return;

    const timer = window.setTimeout(() => {
      markOpeningSecondsSeenToday();
      beginExit();
    }, SECONDS_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [step, beginExit]);

  const showQuestion = step === "question" || step === "rush";
  const questionRushing = step === "rush";

  return (
    <div
      className={`z-opening opening-overlay fixed inset-0 flex items-center justify-center bg-black ${
        step === "exit" ? "opening-overlay--exiting" : ""
      } ${step === "rush" ? "opening-overlay--rushing" : ""}`}
      role="presentation"
      aria-hidden
    >
      {step === "rush" && <OpeningFogRush />}

      {showQuestion && (
        <div
          className={`relative z-10 flex items-center justify-center ${
            questionRushing ? "opening-rush-question" : "opening-hero-enter"
          }`}
        >
          {!questionRushing && (
            <div className="opening-glow-pulse absolute h-40 w-40 rounded-full bg-violet-500/40 blur-3xl sm:h-52 sm:w-52" />
          )}
          <span className="opening-question-glow relative text-[7rem] font-bold leading-none text-violet-400 sm:text-[9rem]">
            ?
          </span>
        </div>
      )}

      {step === "seconds" && (
        <div className="opening-hero-enter relative z-10 text-center">
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
