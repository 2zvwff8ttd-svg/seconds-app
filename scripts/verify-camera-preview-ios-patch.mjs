/**
 * Verifies postinstall iOS camera-preview patches (fail CI if missing).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const controllerPath = resolve(
  process.cwd(),
  "node_modules/@capacitor-community/camera-preview/ios/Sources/CameraPreviewPlugin/CameraController.swift",
);

const controller = await readFile(controllerPath, "utf8");

const checks = [
  {
    label: "videoGravity uses resizeAspect",
    ok: controller.includes("AVLayerVideoGravity.resizeAspect"),
    fail: "AVLayerVideoGravity.resizeAspect not found",
  },
  {
    label: "videoGravity does not use resizeAspectFill",
    ok: !controller.includes("AVLayerVideoGravity.resizeAspectFill"),
    fail: "AVLayerVideoGravity.resizeAspectFill still present",
  },
  {
    label: "natural preview device settings helper",
    ok: controller.includes("applyNaturalPreviewDeviceSettings"),
    fail: "applyNaturalPreviewDeviceSettings helper missing",
  },
  {
    label: "session preset high",
    ok: controller.includes("sessionPreset = .high"),
    fail: "captureSession.sessionPreset = .high missing",
  },
  {
    label: "builtInWideAngleCamera default device",
    ok: controller.includes(
      "AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position:",
    ),
    fail: "builtInWideAngleCamera default selection missing",
  },
  {
    label: "preview layer uses CALayer autoresizing mask",
    ok: controller.includes(
      "autoresizingMask = [.layerWidthSizable, .layerHeightSizable]",
    ),
    fail: "previewLayer autoresizingMask must use layerWidthSizable/layerHeightSizable",
  },
  {
    label: "preview layer does not use UIView autoresizing mask",
    ok: !controller.includes(
      "previewLayer?.autoresizingMask = [.flexibleWidth, .flexibleHeight]",
    ),
    fail: "previewLayer must not use UIView flexibleWidth/flexibleHeight",
  },
];

let failed = false;
for (const check of checks) {
  if (check.ok) {
    console.log(`[verify-camera-preview-ios] OK: ${check.label}`);
  } else {
    console.error(`[verify-camera-preview-ios] FAIL: ${check.fail}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("[verify-camera-preview-ios] all checks passed");
