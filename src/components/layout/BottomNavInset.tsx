"use client";

import { DEFAULT_BOTTOM_NAV_INSET } from "@/components/home/BottomNav";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type BottomNavInsetContextValue = {
  bottomInset: number;
  setBottomInset: (insetPx: number) => void;
  navVisible: boolean;
};

const BottomNavInsetContext = createContext<BottomNavInsetContextValue>({
  bottomInset: DEFAULT_BOTTOM_NAV_INSET,
  setBottomInset: () => {},
  navVisible: false,
});

export function BottomNavInsetProvider({
  navVisible,
  children,
}: {
  navVisible: boolean;
  children: ReactNode;
}) {
  const [bottomInset, setBottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);

  const value = useMemo(
    () => ({
      bottomInset: navVisible ? bottomInset : 0,
      setBottomInset,
      navVisible,
    }),
    [bottomInset, navVisible],
  );

  return (
    <BottomNavInsetContext.Provider value={value}>
      {children}
    </BottomNavInsetContext.Provider>
  );
}

export function useBottomNavInset(): number {
  return useContext(BottomNavInsetContext).bottomInset;
}

export function useBottomNavInsetControls(): BottomNavInsetContextValue {
  return useContext(BottomNavInsetContext);
}
