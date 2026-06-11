import { Capacitor } from "@capacitor/core";

/** Capacitor シェル内（Android / iOS 実機・エミュ） */
export function isNativeCapacitor(): boolean {
  return Capacitor.isNativePlatform();
}

/** 録画に camera-preview を使うか（Web ブラウザでは false） */
export function useNativeCameraPreview(): boolean {
  return isNativeCapacitor();
}
