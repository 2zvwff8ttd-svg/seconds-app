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
    label: "videoGravity uses resizeAspectFill at startup",
    ok:
      controller.includes(
        "previewLayer?.videoGravity = AVLayerVideoGravity.resizeAspectFill",
      ) && !controller.includes("resizeAspectFillFill"),
    fail:
      "AVLayerVideoGravity.resizeAspectFill not found in displayPreview (or FillFill corruption)",
  },
  {
    label: "syncPreviewVideoGravity always aspect-fill",
    ok:
      controller.includes("always aspect-fill for circle-hole") &&
      controller.includes("let gravity: AVLayerVideoGravity = .resizeAspectFill"),
    fail: "syncPreviewVideoGravity must always use resizeAspectFill (no zoom toggle)",
  },
  {
    label: "syncPreviewVideoGravity for pinch zoom",
    ok: controller.includes("syncPreviewVideoGravity(forZoomFactor:"),
    fail: "syncPreviewVideoGravity helper missing",
  },
  {
    label: "pinch handler syncs preview gravity",
    ok: controller.includes("syncPreviewVideoGravity(forZoomFactor: newScaleFactor)"),
    fail: "handlePinch must call syncPreviewVideoGravity when zooming",
  },
  {
    label: "pinch began syncs zoomFactor from device",
    ok: /case \.began:\s*zoomFactor = device\.videoZoomFactor[\s\S]*?fallthrough/.test(
      controller,
    ),
    fail: "handlePinch .began must baseline zoomFactor from device.videoZoomFactor",
  },
  {
    label: "pinch minMaxZoom snaps to ultra-wide floor",
    ok: controller.includes("if clamped <= minZ + 0.05 { return minZ }"),
    fail: "minMaxZoom must snap near minAvailableVideoZoomFactor for reliable 0.5×",
  },
  {
    label: "ensureUltraWideZoomRange keeps raw ≈ 1.0 reachable",
    ok: controller.includes("func ensureUltraWideZoomRange(on"),
    fail: "ensureUltraWideZoomRange helper missing",
  },
  {
    label: "ensureUltraWideZoomRange respects maxLongSide ≤ 1920",
    ok:
      controller.includes("func ensureUltraWideZoomRange(on") &&
      controller.includes(
        "let lockedCapped = locked.filter { formatLongSide(for: $0) <= maxLong }",
      ) &&
      !/func ensureUltraWideZoomRange[\s\S]*?let pool = locked\.isEmpty \? device\.formats : locked/.test(
        controller,
      ),
    fail:
      "ensureUltraWideZoomRange must filter by maxLongSide (must not search uncapped device.formats)",
  },
  {
    label: "stopRecordVideo does not inline videoBase64",
    ok:
      !plugin.includes('payload["videoBase64"]') &&
      !plugin.includes("data.base64EncodedString()") &&
      plugin.includes("attributesOfItem(atPath: url.path)"),
    fail:
      "stopRecordVideo must resolve path + file size only (no Data→base64 bridge payload)",
  },
  {
    label: "setZoom ramps across optical lens hops",
    ok:
      controller.includes("ramp(toVideoZoomFactor:") &&
      controller.includes("withRate: 8)") &&
      !controller.includes("withRate: 8.0)"),
    fail:
      "setZoomFactor must use ramp(toVideoZoomFactor:withRate:) with Float rate (use 8, not 8.0)",
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
    label: "targets ~1080p with max long side 1920",
    ok:
      controller.includes("targetShortSide: Int32 = 1080") &&
      controller.includes("maxLongSide: Int32 = 1920") &&
      controller.includes("formatLongSide(for:"),
    fail: "1080p target / maxLongSide=1920 selection missing",
  },
  {
    label: "does not pick max-pixel HD pool",
    ok:
      !controller.includes("hdShortSideThreshold") &&
      !controller.includes("formatPixelCount(for:"),
    fail: "old max-pixel / hdShortSideThreshold format selection still present",
  },
  {
    label: "prefers H.264 over HEVC for movie output",
    ok:
      /if codecs\.contains\(\.h264\) \{\s*codec = \.h264\s*\} else if codecs\.contains\(\.hevc\)/m.test(
        controller,
      ),
    fail: "H.264-first codec selection missing (HEVC still preferred)",
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
    label: "locks capture to 30fps CFR",
    ok:
      controller.includes("applyLocked30FpsFrameRate") &&
      controller.includes("activeVideoMinFrameDuration") &&
      controller.includes("activeVideoMaxFrameDuration") &&
      controller.includes("targetFrameRate: Int32 = 30"),
    fail: "30fps CFR lock (applyLocked30FpsFrameRate / activeVideoMin/MaxFrameDuration) missing",
  },
  {
    label: "pickBestCaptureFormat prefers locked-30 formats",
    ok: controller.includes("formatSupportsLocked30Fps"),
    fail: "formatSupportsLocked30Fps missing from format picker",
  },
  {
    label: "startRecording prepares device (fps + AE/AF lock)",
    ok:
      controller.includes("prepareDeviceForRecording()") &&
      controller.includes("suppressRecordingGestures = true"),
    fail: "startRecording must call prepareDeviceForRecording and set suppressRecordingGestures",
  },
  {
    label: "stopRecording restores continuous AE/AF",
    ok: controller.includes("restoreContinuousFocusAndExposure()"),
    fail: "restoreContinuousFocusAndExposure missing after stopRecording",
  },
  {
    label: "pinch zoom allowed while recording",
    ok:
      controller.includes("func handlePinch") &&
      !/func handlePinch[\s\S]*?guard !suppressRecordingGestures else \{ return \}/.test(
        controller,
      ),
    fail: "handlePinch must NOT block on suppressRecordingGestures (zoom allowed while recording)",
  },
  {
    label: "setZoom allowed while recording",
    ok: !/func setZoomFactor[\s\S]*?guard !suppressRecordingGestures else \{/.test(
      controller,
    ),
    fail: "setZoomFactor must NOT block on suppressRecordingGestures",
  },
  {
    label: "tap focus disabled while recording",
    ok: /func setFocusAtNormalizedPoint[\s\S]*?guard !suppressRecordingGestures else \{ return \}/.test(
      controller,
    ),
    fail: "setFocusAtNormalizedPoint must early-return when suppressRecordingGestures",
  },
  {
    label: "diagnostics log activeVideo frame duration fps",
    ok: controller.includes("activeVideoMinFrameDuration fps:"),
    fail: "logRearCameraDiagnostics must print activeVideoMin/MaxFrameDuration fps",
  },
  {
    label: "builtInWideAngleCamera default device",
    ok:
      controller.includes(
        "AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position:",
      ) && controller.includes("func selectRearCameraDevice()"),
    fail: "front wide or selectRearCameraDevice helper missing",
  },
  {
    label: "setFocusAtNormalizedPoint helper",
    ok: controller.includes("func setFocusAtNormalizedPoint"),
    fail: "setFocusAtNormalizedPoint missing",
  },
  {
    label: "getAvailableLenses helper",
    ok: controller.includes("func getAvailableLenses()"),
    fail: "getAvailableLenses missing",
  },
  {
    label: "display zoom mapping (wideBaseRawZoom)",
    ok: controller.includes("func wideBaseRawZoom(for device: AVCaptureDevice)"),
    fail: "wideBaseRawZoom helper missing (display 1x mapping)",
  },
  {
    label: "rear camera diagnostic log",
    ok: controller.includes("func logRearCameraDiagnostics(context:"),
    fail: "logRearCameraDiagnostics missing",
  },
  {
    label: "starts at wide 1x display zoom",
    ok: controller.includes("device.videoZoomFactor = defaultWideRawZoom(for: device)"),
    fail: "applyNaturalPreviewDeviceSettings must set defaultWideRawZoom (1x wide)",
  },
  {
    label: "native tap gesture disabled for web focus",
    ok: !controller.includes("setupTapGesture(target: target, selector: #selector(handleTap"),
    fail: "native tap gesture should be removed (web setFocusPoint)",
  },
  {
    label: "setFocusPoint plugin method",
    ok: plugin.includes('CAPPluginMethod(name: "setFocusPoint"'),
    fail: "setFocusPoint not registered on CameraPreview plugin",
  },
  {
    label: "setZoom plugin method",
    ok: plugin.includes('CAPPluginMethod(name: "setZoom"'),
    fail: "setZoom not registered on CameraPreview plugin",
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
  {
    label: "locks multi-cam constituent switching while recording",
    ok:
      controller.includes("lockConstituentSwitchingForRecording(on: movieOutput)") &&
      controller.includes(
        "setPrimaryConstituentDeviceSwitchingBehaviorForRecording",
      ) &&
      controller.includes(".locked"),
    fail:
      "startRecording must lock primaryConstituentDeviceSwitchingBehaviorForRecording to .locked",
  },
  {
    label: "skips constituent switching on unsupported cameras",
    ok:
      controller.includes(
        "device.activePrimaryConstituentDeviceSwitchingBehavior != .unsupported",
      ) &&
      controller.includes(
        "skipped constituent switching lock: unsupported active camera",
      ),
    fail:
      "constituent switching must be guarded when the active camera reports .unsupported",
  },
  {
    label: "pauses VideoDataOutput while recording",
    ok:
      controller.includes("setVideoDataOutputEnabled(false)") &&
      controller.includes("setVideoDataOutputEnabled(true)"),
    fail:
      "VideoDataOutput connections must be disabled during recording and re-enabled after",
  },
  {
    label: "logs pinch during recording",
    ok: controller.includes("pinch began during recording"),
    fail: "handlePinch must log when pinch begins during recording",
  },
  {
    label: "installs session health observers (interruption/runtimeError/thermal/pressure)",
    ok:
      controller.includes("func installSessionHealthObservers()") &&
      controller.includes("AVCaptureSession.wasInterruptedNotification") &&
      controller.includes("AVCaptureSession.runtimeErrorNotification") &&
      controller.includes("ProcessInfo.thermalStateDidChangeNotification") &&
      controller.includes("observe(\\AVCaptureDevice.systemPressureState") &&
      controller.includes("[clip-av-native]"),
    fail:
      "CameraController must observe session interruption, runtimeError, thermalState, systemPressure and log as [clip-av-native]",
  },
  {
    label: "cameraTemperature factor gated to iOS 17+",
    ok: (() => {
      if (!controller.includes(".cameraTemperature")) return true;
      // Old unguarded form (depthModule line immediately followed by cameraTemperature if).
      const unguardedPair =
        /depthModuleTemperature"\)\s*\}\s*\n\s*if factors\.contains\(\.cameraTemperature\)/.test(
          controller,
        );
      const gated =
        /if #available\(iOS 17\.0, \*\) \{\s*\n\s*if factors\.contains\(\.cameraTemperature\)/.test(
          controller,
        );
      return gated && !unguardedPair;
    })(),
    fail:
      ".cameraTemperature must only be referenced inside if #available(iOS 17.0, *)",
  },
  {
    label: "logs full MovieFileOutput delegate NSError evidence",
    ok:
      controller.includes("movieFileOutputDidFinish") &&
      controller.includes("nsErrorEvidence"),
    fail: "didFinishRecording must log full domain/code/userInfo via nsErrorEvidence",
  },
  {
    label: "tears down session health observers on preview stop",
    ok: plugin.includes("teardownSessionHealthObservers()"),
    fail: "CameraPreviewPlugin.stop must call teardownSessionHealthObservers()",
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
