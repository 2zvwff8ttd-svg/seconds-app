import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "@/lib/supabase/client";

const PUSH_TOKEN_SESSION_KEY = "seconds:ios_push_token";

let listenersAttached = false;
let currentToken: string | null = null;

export function isIosNativePushSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

function readStoredToken(): string | null {
  if (typeof sessionStorage === "undefined") return currentToken;
  return sessionStorage.getItem(PUSH_TOKEN_SESSION_KEY) ?? currentToken;
}

function storeToken(token: string): void {
  currentToken = token;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(PUSH_TOKEN_SESSION_KEY, token);
  }
}

function clearStoredToken(): void {
  currentToken = null;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(PUSH_TOKEN_SESSION_KEY);
  }
}

async function upsertPushToken(userId: string, token: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("push_device_tokens").upsert(
    {
      user_id: userId,
      platform: "ios",
      token,
      enabled: true,
    },
    { onConflict: "user_id,token" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function ensurePushListeners(): Promise<void> {
  if (listenersAttached || !isIosNativePushSupported()) return;

  listenersAttached = true;

  await PushNotifications.addListener("registration", (event) => {
    const token = event.value?.trim();
    if (!token) return;

    storeToken(token);

    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      try {
        await upsertPushToken(user.id, token);
      } catch (err) {
        console.warn("[push] token upsert failed", err);
      }
    })();
  });

  await PushNotifications.addListener("registrationError", (error) => {
    console.warn("[push] registration error", error);
  });
}

export async function registerPushNotifications(): Promise<void> {
  if (!isIosNativePushSupported()) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await ensurePushListeners();

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    return;
  }

  await PushNotifications.register();

  const existingToken = readStoredToken();
  if (existingToken) {
    try {
      await upsertPushToken(user.id, existingToken);
    } catch (err) {
      console.warn("[push] existing token upsert failed", err);
    }
  }
}

export async function disablePushNotifications(): Promise<void> {
  if (!isIosNativePushSupported()) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const token = readStoredToken();

  try {
    if (token) {
      const { error } = await supabase
        .from("push_device_tokens")
        .update({ enabled: false })
        .eq("user_id", user.id)
        .eq("token", token);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("push_device_tokens")
        .update({ enabled: false })
        .eq("user_id", user.id)
        .eq("platform", "ios");

      if (error) throw new Error(error.message);
    }
  } catch (err) {
    console.warn("[push] disable token failed", err);
  } finally {
    clearStoredToken();
  }
}
