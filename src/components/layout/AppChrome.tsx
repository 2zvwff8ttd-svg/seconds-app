"use client";

import { BottomNav } from "@/components/home/BottomNav";
import {
  BottomNavInsetProvider,
  useBottomNavInsetControls,
} from "@/components/layout/BottomNavInset";
import { shouldShowMainBottomNav } from "@/lib/navigation/bottom-nav-visibility";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function AppChromeInner({ children }: { children: ReactNode }) {
  const { navVisible, setBottomInset } = useBottomNavInsetControls();

  return (
    <>
      {children}
      {navVisible ? <BottomNav onInsetChange={setBottomInset} /> : null}
    </>
  );
}

/**
 * Persistent chrome: one BottomNav instance across tab switches.
 * Pages read inset via useBottomNavInset().
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const navVisible = shouldShowMainBottomNav(pathname);

  return (
    <BottomNavInsetProvider navVisible={navVisible}>
      <AppChromeInner>{children}</AppChromeInner>
    </BottomNavInsetProvider>
  );
}
