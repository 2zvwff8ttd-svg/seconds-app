"use client";

import { GlobalUploadBar } from "@/components/upload/GlobalUploadBar";
import { PushRegistrationEffect } from "@/components/push/PushRegistrationEffect";
import { UploadProvider } from "@/lib/upload/upload-context";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <UploadProvider>
      <PushRegistrationEffect />
      <GlobalUploadBar />
      {children}
    </UploadProvider>
  );
}
