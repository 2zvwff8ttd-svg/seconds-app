/**
 * Verifies postinstall iOS camera-preview patches (fail CI if missing).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const controllerPath = resolve(
  process.cwd(),
  "node_modules/@capacitor-community/camera-preview/ios/Sources/CameraPreviewPlugin/CameraController.swift",
);
const pluginPath = resolve(
  process.cwd(),
  "node_modules/@capacitor-community/camera-preview/ios/Sources/CameraPreviewPlugin/CameraPreviewPlugin.swift",
);

const [controller, plugin] = await Promise.all([
  readFile(controllerPath, "utf8"),
  readFile(pluginPath, "utf8"),
]);

const forbiddenPatterns = [
  {
    label: "previewLayer autoresizingMask (unavailable on iOS)",
    pattern: /previewLayer\?\.autoresizingMask/,
    sources: [{ name: "CameraController.swift", content: controller }],
  },
  {
    label: "CALayer flexibleWidth/flexibleHeight mask",
    pattern: /\.flexibleWidth|\.flexibleHeight/,
    sources: [{ name: "CameraController.swift", content: controller }],
  },
  {
    label: "CALayer layerWidthSizable/layerHeightSizable mask",
    pattern: /\.layerWidthSizable|\.layerHeightSizable/,
    sources: [{ name: "CameraController.swift", content: controller }],
  },
  {
    label: "availableVideoCodecTypes(for:) invalid API",
    pattern: /availableVideoCodecTypes\(for:/,
    sources: [{ name: "CameraController.swift", content: controller }],
  },
];

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
    label: "CoreMedia import",
    ok: controller.includes("import CoreMedia"),
    fail: "import CoreMedia missing in CameraController.swift",
  },
  {
    label: "SecondsAppCaptureSettings enum",
    ok: controller.includes("enum SecondsAppCaptureSettings"),
    fail: "SecondsAppCaptureSettings enum missing",
  },
  {
    label: "uses availableVideoCodecTypes property",
    ok: controller.includes("movieOutput.availableVideoCodecTypes"),
    fail: "movieOutput.availableVideoCodecTypes missing",
  },
  {
    label: "does not call availableVideoCodecTypes(for:)",
    ok: !controller.includes("availableVideoCodecTypes(for:"),
    fail: "availableVideoCodecTypes(for:) still present (invalid on AVCaptureMovieFileOutput)",
  },
  {
    label: "pickBestCaptureFormat helper",
    ok: controller.includes("pickBestCaptureFormat(from:"),
    fail: "pickBestCaptureFormat helper missing",
  },
  {
    label: "configureMovieFileOutput helper",
    ok: controller.includes("func configureMovieFileOutput(_ movieOutput: AVCaptureMovieFileOutput)"),
    fail: "configureMovieFileOutput helper missing",
  },
  {
    label: "movie minimum average bitrate",
    ok: controller.includes("AVVideoAverageBitRateKey"),
    fail: "AVVideoAverageBitRateKey missing in movie output settings",
  },
  {
    label: "session preset hd1920x1080",
    ok: controller.includes("sessionPreset = .hd1920x1080"),
    fail: "captureSession.sessionPreset = .hd1920x1080 missing",
  },
  {
    label: "does not pick widest FOV only",
    ok: !controller.includes(
      "device.formats.max(by: { $0.videoFieldOfView < $1.videoFieldOfView })",
    ),
    fail: "widest-FOV-only format selection still present",
  },
  {
    label: "builtInWideAngleCamera default device",
    ok: controller.includes(
      "AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position:",
    ),
    fail: "builtInWideAngleCamera default selection missing",
  },
  {
    label: "syncPreviewLayerFrame helper",
    ok: controller.includes("func syncPreviewLayerFrame(in view: UIView)"),
    fail: "syncPreviewLayerFrame helper missing",
  },
  {
    label: "displayPreview uses syncPreviewLayerFrame",
    ok: controller.includes("self.syncPreviewLayerFrame(in: view)"),
    fail: "displayPreview must call syncPreviewLayerFrame(in:)",
  },
  {
    label: "CameraPreviewHostView layoutSubviews host",
    ok: plugin.includes("class CameraPreviewHostView: UIView"),
    fail: "CameraPreviewHostView missing in CameraPreviewPlugin.swift",
  },
  {
    label: "rotated() syncs preview layer via host helper",
    ok: plugin.includes(
      "self.cameraController.syncPreviewLayerFrame(in: previewView)",
    ),
    fail: "rotated() must call syncPreviewLayerFrame(in:)",
  },
  {
    label: "plugin does not assign previewLayer.frame directly",
    ok: !/cameraController\.previewLayer\?\.frame\s*=/.test(plugin),
    fail: "CameraPreviewPlugin must not set previewLayer.frame directly (use syncPreviewLayerFrame)",
  },
];

let failed = false;

for (const forbidden of forbiddenPatterns) {
  for (const source of forbidden.sources) {
    if (forbidden.pattern.test(source.content)) {
      console.error(
        `[verify-camera-preview-ios] FAIL: forbidden API in ${source.name}: ${forbidden.label}`,
      );
      failed = true;
    }
  }
}

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
