"use client";

import { fetchDmUnreadCount } from "@/lib/dm/unread";
import { subscribeDmUnreadCount } from "@/lib/dm/subscribe";
import { createClient } from "@/lib/supabase/client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type DmUnreadContextValue = {
  dmUnreadCount: number;
};

const DmUnreadContext = createContext<DmUnreadContextValue>({
  dmUnreadCount: 0,
});

/**
 * Owns a single DM unread subscription for the whole app session
 * (shared by BottomNav + PostBottomNavSheet).
 */
export function DmUnreadProvider({ children }: { children: ReactNode }) {
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof subscribeDmUnreadCount> | null>(
    null,
  );

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const clearChannel = () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };

    const attachForUser = async (userId: string) => {
      clearChannel();
      try {
        const count = await fetchDmUnreadCount();
        if (!cancelled) setDmUnreadCount(count);
      } catch {
        if (!cancelled) setDmUnreadCount(0);
      }
      if (cancelled) return;
      channelRef.current = subscribeDmUnreadCount(userId, (count) => {
        if (!cancelled) setDmUnreadCount(count);
      });
    };

    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setDmUnreadCount(0);
        return;
      }
      await attachForUser(user.id);
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || !session?.user) {
        clearChannel();
        setDmUnreadCount(0);
        return;
      }
      if (event === "SIGNED_IN") {
        void attachForUser(session.user.id);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearChannel();
    };
  }, []);

  const value = useMemo(() => ({ dmUnreadCount }), [dmUnreadCount]);

  return (
    <DmUnreadContext.Provider value={value}>{children}</DmUnreadContext.Provider>
  );
}

export function useDmUnreadCount(): number {
  return useContext(DmUnreadContext).dmUnreadCount;
}
