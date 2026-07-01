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

type PrivateKeyFormat =
  | "pem_pkcs8"
  | "pem_ec"
  | "raw_base64"
  | "empty";

type PrivateKeyNormalizeMeta = {
  format: PrivateKeyFormat;
  rawLength: number;
  normalizedLength: number;
  lineCount: number;
  hadLiteralBackslashN: boolean;
  hadCarriageReturn: boolean;
  hadSurroundingQuotes: boolean;
};

let cachedJwt: { token: string; expiresAt: number } | null = null;

function apnsHost(environment: ApnsEnvironment): string {
  return environment === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
}

function isApnsJwtDebugEnabled(): boolean {
  const flag = (Deno.env.get("APNS_DEBUG_JWT") ?? "true").toLowerCase();
  return flag !== "false" && flag !== "0" && flag !== "off";
}

function decodeJwtPart(part: string): Record<string, unknown> | null {
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = atob(padded + "=".repeat(padLen));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function describeJwt(token: string): {
  header: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  segmentCount: number;
} {
  const parts = token.split(".");
  return {
    segmentCount: parts.length,
    header: parts[0] ? decodeJwtPart(parts[0]) : null,
    payload: parts[1] ? decodeJwtPart(parts[1]) : null,
  };
}

function logApnsJwtDebug(
  event: string,
  config: ApnsConfig,
  jwt: string,
  keyMeta: PrivateKeyNormalizeMeta,
  extra?: Record<string, unknown>,
): void {
  if (!isApnsJwtDebugEnabled()) return;

  const { header, payload, segmentCount } = describeJwt(jwt);
  console.log("[apns-jwt-debug]", {
    event,
    environment: config.environment,
    apnsHost: apnsHost(config.environment),
    apnsTopic: config.bundleId,
    configKeyId: config.keyId,
    configTeamId: config.teamId,
    configKeyIdLength: config.keyId.length,
    configTeamIdLength: config.teamId.length,
    jwtSegmentCount: segmentCount,
    jwtHeader: header,
    jwtPayload: payload,
    jwtHeaderKid: header?.kid ?? null,
    jwtPayloadIss: payload?.iss ?? null,
    jwtPayloadIat: payload?.iat ?? null,
    privateKeyFormat: keyMeta.format,
    privateKeyRawLength: keyMeta.rawLength,
    privateKeyNormalizedLength: keyMeta.normalizedLength,
    privateKeyLineCount: keyMeta.lineCount,
    privateKeyHadLiteralBackslashN: keyMeta.hadLiteralBackslashN,
    privateKeyHadCarriageReturn: keyMeta.hadCarriageReturn,
    privateKeyHadSurroundingQuotes: keyMeta.hadSurroundingQuotes,
    ...extra,
  });
}

function normalizePrivateKey(raw: string): {
  pem: string;
  meta: PrivateKeyNormalizeMeta;
} {
  let trimmed = raw.trim();
  const hadSurroundingQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (hadSurroundingQuotes) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  const hadLiteralBackslashN = trimmed.includes("\\n");
  const hadCarriageReturn = trimmed.includes("\r");
  trimmed = trimmed.replace(/\\n/g, "\n").replace(/\r/g, "");

  let format: PrivateKeyFormat = "empty";
  let pem = trimmed;

  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    format = "pem_pkcs8";
    pem = trimmed;
  } else if (trimmed.includes("BEGIN EC PRIVATE KEY")) {
    format = "pem_ec";
    pem = trimmed;
  } else {
    format = "raw_base64";
    const body = trimmed.replace(/\s+/g, "");
    const lines = body.match(/.{1,64}/g) ?? [body];
    pem = ["-----BEGIN PRIVATE KEY-----", ...lines, "-----END PRIVATE KEY-----"].join(
      "\n",
    );
  }

  return {
    pem,
    meta: {
      format,
      rawLength: raw.length,
      normalizedLength: pem.length,
      lineCount: pem.split("\n").length,
      hadLiteralBackslashN,
      hadCarriageReturn,
      hadSurroundingQuotes,
    },
  };
}

async function getApnsJwt(config: ApnsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now + 120) {
    if (isApnsJwtDebugEnabled()) {
      const { header, payload } = describeJwt(cachedJwt.token);
      console.log("[apns-jwt-debug]", {
        event: "jwt_cache_hit",
        cacheExpiresAt: cachedJwt.expiresAt,
        jwtHeaderKid: header?.kid ?? null,
        jwtPayloadIss: payload?.iss ?? null,
        jwtPayloadIat: payload?.iat ?? null,
      });
    }
    return cachedJwt.token;
  }

  const { pem, meta } = normalizePrivateKey(config.privateKey);

  if (!pem || meta.format === "empty") {
    const message = "APNS_PRIVATE_KEY is empty after normalization";
    console.error("[apns-jwt] importPKCS8 failed", { message, keyMeta: meta });
    throw new Error(message);
  }

  let key;
  try {
    key = await importPKCS8(pem, "ES256");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[apns-jwt] importPKCS8 failed", {
      message,
      keyMeta: meta,
      configKeyId: config.keyId,
      configTeamId: config.teamId,
    });
    throw new Error(`APNS private key import failed: ${message}`);
  }

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt(now)
    .sign(key);

  cachedJwt = { token, expiresAt: now + 3300 };
  logApnsJwtDebug("jwt_minted", config, token, meta, {
    issuedAt: now,
    cacheExpiresAt: cachedJwt.expiresAt,
  });

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
  const keyId = Deno.env.get("APNS_KEY_ID")?.trim();
  const teamId = Deno.env.get("APNS_TEAM_ID")?.trim();
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
  const bundleId = Deno.env.get("APNS_BUNDLE_ID")?.trim();
  const environmentRaw = (Deno.env.get("APNS_ENVIRONMENT") ?? "production")
    .trim()
    .toLowerCase();

  if (!keyId || !teamId || !privateKey || !bundleId) {
    if (isApnsJwtDebugEnabled()) {
      console.warn("[apns-jwt-debug]", {
        event: "config_missing",
        hasKeyId: Boolean(keyId),
        hasTeamId: Boolean(teamId),
        hasPrivateKey: Boolean(privateKey),
        hasBundleId: Boolean(bundleId),
        keyIdLength: keyId?.length ?? 0,
        teamIdLength: teamId?.length ?? 0,
        privateKeyLength: privateKey.length,
        bundleId,
      });
    }
    return null;
  }

  const environment: ApnsEnvironment =
    environmentRaw === "development" || environmentRaw === "sandbox"
      ? "sandbox"
      : "production";

  if (isApnsJwtDebugEnabled()) {
    const { meta } = normalizePrivateKey(privateKey);
    console.log("[apns-jwt-debug]", {
      event: "config_loaded",
      keyId,
      teamId,
      bundleId,
      environment,
      keyIdLength: keyId.length,
      teamIdLength: teamId.length,
      privateKeyFormat: meta.format,
      privateKeyRawLength: meta.rawLength,
      privateKeyLineCount: meta.lineCount,
      privateKeyHadLiteralBackslashN: meta.hadLiteralBackslashN,
      privateKeyHadSurroundingQuotes: meta.hadSurroundingQuotes,
    });
  }

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

    if (reason === "InvalidProviderToken" && isApnsJwtDebugEnabled()) {
      const { meta } = normalizePrivateKey(config.privateKey);
      logApnsJwtDebug("apns_invalid_provider_token", config, jwt, meta, {
        apnsStatus: response.status,
        apnsReason: reason,
        apnsId,
        deviceTokenPrefix: normalizedToken.slice(0, 8),
      });
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
