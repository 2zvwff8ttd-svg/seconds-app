"use client";

import { GlobalUploadBar } from "@/components/upload/GlobalUploadBar";
import { AppChrome } from "@/components/layout/AppChrome";
import { DmUnreadProvider } from "@/components/dm/DmUnreadProvider";
import { PushRegistrationEffect } from "@/components/push/PushRegistrationEffect";
import { SaveComposeEffect } from "@/components/video/SaveComposeEffect";
import { UploadProvider } from "@/lib/upload/upload-context";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <UploadProvider>
      <DmUnreadProvider>
        <PushRegistrationEffect />
        <SaveComposeEffect />
        <GlobalUploadBar />
        <AppChrome>{children}</AppChrome>
      </DmUnreadProvider>
    </UploadProvider>
  );
}