"use client";

import { BottomNavButtons } from "@/components/home/BottomNavButtons";
import { fetchDmUnreadCount } from "@/lib/dm/unread";
import { subscribeDmUnreadCount } from "@/lib/dm/subscribe";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState } from "react";

type BottomNavProps = {
  /** Total px to reserve at the bottom (nav bar + record button protrusion). */
  onInsetChange?: (insetPx: number) => void;
};

export function BottomNav({ onInsetChange }: BottomNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof subscribeDmUnreadCount> | null = null;

    const setup = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      try {
        const count = await fetchDmUnreadCount();
        setDmUnreadCount(count);
      } catch {
        setDmUnreadCount(0);
      }

      channel = subscribeDmUnreadCount(user.id, setDmUnreadCount);
    };

    void setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !onInsetChange) return;

    const reportInset = () => {
      const navRect = nav.getBoundingClientRect();
      const recordBtn = nav.querySelector<HTMLElement>("[data-record-button]");
      const recordRect = recordBtn?.getBoundingClientRect();
      const topEdge = recordRect
        ? Math.min(navRect.top, recordRect.top)
        : navRect.top;
      onInsetChange(Math.ceil(window.innerHeight - topEdge));
    };

    reportInset();
    const observer = new ResizeObserver(reportInset);
    observer.observe(nav);
    window.addEventListener("resize", reportInset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reportInset);
    };
  }, [onInsetChange]);

  return (
    <nav
      ref={navRef}
      className="z-bottom-nav pointer-events-auto fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 backdrop-blur-lg"
      aria-label="Main"
    >
      <BottomNavButtons dmUnreadCount={dmUnreadCount} />
    </nav>
  );
}

export const DEFAULT_BOTTOM_NAV_INSET = 88;
