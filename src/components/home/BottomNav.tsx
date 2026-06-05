"use client";

import { fetchDmUnreadCount } from "@/lib/dm/unread";
import { subscribeDmUnreadCount } from "@/lib/dm/subscribe";
import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/" },
  { id: "search", label: "Search", href: "/search" },
  { id: "camera", label: "Record", href: "/post", primary: true },
  { id: "messages", label: "Messages", href: "/messages" },
  { id: "profile", label: "Profile", href: "/profile" },
] as const;

function NavIcon({ id }: { id: string }) {
  const className = "h-6 w-6";
  switch (id) {
    case "home":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3l9 8h-3v9H6v-9H3l9-8z" />
        </svg>
      );
    case "search":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3-3" />
        </svg>
      );
    case "camera":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "messages":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 5h16v11H7l-3 3V5z" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="9" r="4" />
          <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" />
        </svg>
      );
  }
}

type BottomNavProps = {
  /** Total px to reserve at the bottom (nav bar + record button protrusion). */
  onInsetChange?: (insetPx: number) => void;
};

export function BottomNav({ onInsetChange }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
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

  const navigate = (href: string) => {
    if (href === "#") return;
    router.push(href);
  };

  return (
    <nav
      ref={navRef}
      className="z-bottom-nav pointer-events-auto fixed inset-x-0 bottom-0 grid grid-cols-5 items-end border-t border-border bg-surface/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-lg sm:px-2 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pt-2"
      aria-label="Main"
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        const isPrimary = "primary" in item && item.primary;
        const showDmBadge = item.id === "messages" && dmUnreadCount > 0;

        const className = isPrimary
          ? "relative z-0 -mt-5 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30 touch-manipulation"
          : `relative z-10 flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] transition touch-manipulation ${
              isActive
                ? "text-foreground"
                : "text-muted hover:text-foreground/80"
            }`;

        if (isPrimary) {
          return (
            <button
              key={item.id}
              type="button"
              data-record-button
              onClick={() => navigate(item.href)}
              className={className}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <NavIcon id={item.id} />
            </button>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.href)}
            className={className}
            aria-label={
              showDmBadge ? `${item.label}（未読${dmUnreadCount}件）` : item.label
            }
            aria-current={isActive ? "page" : undefined}
          >
            <span className="relative">
              <NavIcon id={item.id} />
              {showDmBadge && (
                <span
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[9px] font-bold text-white ring-2 ring-surface"
                  aria-hidden
                >
                  {dmUnreadCount > 9 ? "9+" : dmUnreadCount}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export const DEFAULT_BOTTOM_NAV_INSET = 88;
