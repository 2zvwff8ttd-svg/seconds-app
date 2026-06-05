"use client";

import { OnboardingCarousel } from "@/components/onboarding/OnboardingCarousel";

type OnboardingOverlayProps = {
  onComplete: () => void;
};

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  return (
    <div
      className="z-onboarding fixed inset-0 flex flex-col bg-black"
      role="dialog"
      aria-modal
      aria-label="?Seconds の使い方"
    >
      <OnboardingCarousel onComplete={onComplete} />
    </div>
  );
}
