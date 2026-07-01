import { CameraPreview } from "@capacitor-community/camera-preview";

export type NativeCameraLens = {
  id: string;
  label: string;
  factor: number;
};

type NativeCameraPreviewExtended = {
  setFocusPoint(options: { x: number; y: number }): Promise<void>;
  getAvailableLenses(): Promise<{ lenses: NativeCameraLens[] }>;
  setZoom(options: { factor: number }): Promise<{ factor: number }>;
  getZoom(): Promise<{ factor: number }>;
};

function plugin(): NativeCameraPreviewExtended {
  return CameraPreview as unknown as NativeCameraPreviewExtended;
}

/** Normalized 0–1 coords relative to fullscreen native preview (visual viewport). */
export async function setNativeFocusPoint(x: number, y: number): Promise<void> {
  const nx = Math.min(1, Math.max(0, x));
  const ny = Math.min(1, Math.max(0, y));
  await plugin().setFocusPoint({ x: nx, y: ny });
}

export async function getNativeAvailableLenses(): Promise<NativeCameraLens[]> {
  const result = await plugin().getAvailableLenses();
  const lenses = result.lenses ?? [];
  return lenses
    .filter(
      (lens): lens is NativeCameraLens =>
        typeof lens?.id === "string" &&
        typeof lens?.label === "string" &&
        typeof lens?.factor === "number",
    )
    .sort((a, b) => a.factor - b.factor);
}

export async function setNativeZoomFactor(factor: number): Promise<number> {
  const result = await plugin().setZoom({ factor });
  return result.factor;
}

export async function getNativeZoomFactor(): Promise<number> {
  const result = await plugin().getZoom();
  return result.factor;
}

/** Map viewport client coords → normalized preview coords. */
export function viewportClientToPreviewNormalized(
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const offsetX = viewport?.offsetLeft ?? 0;
  const offsetY = viewport?.offsetTop ?? 0;
  return {
    x: (clientX - offsetX) / width,
    y: (clientY - offsetY) / height,
  };
}
