import { SignJWT, importPKCS8 } from "npm:jose@5";

export type ApnsEnvironment = "production" | "development" | "sandbox";

export type ApnsConfig = {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  environment: ApnsEnvironment;
};

export type ApnsAlertPayload = {
  title: string;
  body: string;
};

export type ApnsSendResult = {
  ok: boolean;
  status: number;
  apnsId?: string;
  reason?: string;
  tokenInvalid?: boolean;
};

let cachedJwt: { token: string; expiresAt: number } | null = null;

function apnsHost(environment: ApnsEnvironment): string {
  return environment === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
}

function normalizePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [body];
  return ["-----BEGIN PRIVATE KEY-----", ...lines, "-----END PRIVATE KEY-----"].join(
    "\n",
  );
}

async function getApnsJwt(config: ApnsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now + 120) {
    return cachedJwt.token;
  }

  const key = await importPKCS8(normalizePrivateKey(config.privateKey), "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt(now)
    .sign(key);

  cachedJwt = { token, expiresAt: now + 3300 };
  return token;
}

function isInvalidToken(status: number, reason?: string): boolean {
  if (status === 410) return true;
  if (status !== 400 || !reason) return false;
  return (
    reason === "BadDeviceToken" ||
    reason === "Unregistered" ||
    reason === "DeviceTokenNotForTopic"
  );
}

export function loadApnsConfigFromEnv(): ApnsConfig | null {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");
  const environmentRaw = (Deno.env.get("APNS_ENVIRONMENT") ?? "production").toLowerCase();

  if (!keyId || !teamId || !privateKey || !bundleId) {
    return null;
  }

  const environment: ApnsEnvironment =
    environmentRaw === "development" || environmentRaw === "sandbox"
      ? "sandbox"
      : "production";

  return {
    keyId,
    teamId,
    privateKey,
    bundleId,
    environment,
  };
}

export async function sendApnsAlert(
  config: ApnsConfig,
  deviceToken: string,
  payload: ApnsAlertPayload,
): Promise<ApnsSendResult> {
  const jwt = await getApnsJwt(config);
  const host = apnsHost(config.environment);
  const normalizedToken = deviceToken.replace(/\s+/g, "");

  const body = JSON.stringify({
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: "default",
    },
  });

  const client = Deno.createHttpClient({ alpnProtocols: ["h2"] });
  try {
    const response = await fetch(`${host}/3/device/${normalizedToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": config.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body,
      // @ts-expect-error Deno HttpClient option for HTTP/2 APNs
      client,
    });

    const apnsId = response.headers.get("apns-id") ?? undefined;

    if (response.ok) {
      return { ok: true, status: response.status, apnsId };
    }

    let reason: string | undefined;
    try {
      const json = (await response.json()) as { reason?: string };
      reason = json.reason;
    } catch {
      /* empty body */
    }

    return {
      ok: false,
      status: response.status,
      apnsId,
      reason,
      tokenInvalid: isInvalidToken(response.status, reason),
    };
  } finally {
    client.close();
  }
}
