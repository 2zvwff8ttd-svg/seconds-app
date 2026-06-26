"use client";

import {
  disablePushNotifications,
  registerPushNotifications,
} from "@/lib/push/register-push";
import { createClient } from "@/lib/supabase/client";
import { useEffect } from "react";

/** Registers iOS APNs token after login; disables on logout. No-op on web. */
export function PushRegistrationEffect() {
  useEffect(() => {
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        void registerPushNotifications();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        void registerPushNotifications();
        return;
      }
      if (event === "SIGNED_OUT") {
        void disablePushNotifications();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
