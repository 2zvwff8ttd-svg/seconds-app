"use client";

import {
  hasSeenOpeningSecondsToday,
  markOpeningSecondsSeenToday,
} from "@/lib/opening/state";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { useEffect, useState } from "react";

const QUESTION_DURATION_MS = 2000;
const SECONDS_DURATION_MS = 2200;

type OpeningStep = "question" | "seconds";

type OpeningOverlayProps = {
  onComplete: () => void;
};

export function OpeningOverlay({ onComplete }: OpeningOverlayProps) {
  const [step, setStep] = useState<OpeningStep>("question");
  const [assignedSeconds, setAssignedSeconds] = useState<number | null>(null);
  const [showSecondsStep, setShowSecondsStep] = useState(false);
  const [secondsReady, setSecondsReady] = useState(false);

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

  useEffect(() => {
    if (step !== "question" || !secondsReady) return;

    const timer = window.setTimeout(() => {
      if (showSecondsStep && assignedSeconds !== null) {
        setStep("seconds");
        return;
      }
      onComplete();
    }, QUESTION_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [step, showSecondsStep, secondsReady, assignedSeconds, onComplete]);

  useEffect(() => {
    if (step !== "seconds") return;

    const timer = window.setTimeout(() => {
      markOpeningSecondsSeenToday();
      onComplete();
    }, SECONDS_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [step, onComplete]);

  return (
    <div
      className="z-opening fixed inset-0 flex items-center justify-center bg-black"
      role="presentation"
      aria-hidden
    >
      {step === "question" ? (
        <div className="opening-hero-enter relative flex items-center justify-center">
          <div className="opening-glow-pulse absolute h-40 w-40 rounded-full bg-violet-500/40 blur-3xl sm:h-52 sm:w-52" />
          <span className="opening-question-glow relative text-[7rem] font-bold leading-none text-violet-400 sm:text-[9rem]">
            ?
          </span>
        </div>
      ) : (
        <div className="opening-hero-enter text-center">
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
