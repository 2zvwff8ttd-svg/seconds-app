export type ProfilePhotoTransformResult = {
  imageBase64: string;
  mimeType: string;
  model: string;
  jobId: string;
};

export class ProfilePhotoClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ProfilePhotoClientError";
    this.code = code;
    this.status = status;
  }
}

export async function requestIdPhotoTransform(options: {
  file?: File | null;
  useCurrentAvatar?: boolean;
  signal?: AbortSignal;
}): Promise<ProfilePhotoTransformResult> {
  const form = new FormData();
  if (options.file) {
    form.set("image", options.file);
  } else if (options.useCurrentAvatar) {
    form.set("useCurrentAvatar", "1");
  } else {
    throw new ProfilePhotoClientError(
      "MISSING_IMAGE",
      "変換する画像がありません",
      400,
    );
  }

  const response = await fetch("/api/ai/profile-photo", {
    method: "POST",
    body: form,
    signal: options.signal,
  });

  let body: {
    error?: string;
    code?: string;
    imageBase64?: string;
    mimeType?: string;
    model?: string;
    jobId?: string;
  } = {};

  try {
    body = (await response.json()) as typeof body;
  } catch {
    // ignore
  }

  if (!response.ok) {
    throw new ProfilePhotoClientError(
      body.code || "REQUEST_FAILED",
      body.error || "証明写真風への変換に失敗しました",
      response.status,
    );
  }

  if (!body.imageBase64 || !body.mimeType) {
    throw new ProfilePhotoClientError(
      "EMPTY_RESULT",
      "変換結果を取得できませんでした",
      502,
    );
  }

  return {
    imageBase64: body.imageBase64,
    mimeType: body.mimeType,
    model: body.model || "gpt-image-1.5",
    jobId: body.jobId || "",
  };
}

export function base64ToObjectUrl(imageBase64: string, mimeType: string): string {
  const binary = atob(imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}
