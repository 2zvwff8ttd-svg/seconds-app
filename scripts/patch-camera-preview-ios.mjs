/**
 * Patches @capacitor-community/camera-preview iOS:
 * 1. Implements AVCaptureMovieFileOutput video recording (stock v8 stubs hang forever)
 * 2. startRecordVideo resolves when recording starts; stopRecordVideo returns videoFilePath
 * 3. Uses videoRotationAngle on iOS 17+ (setVideoOrientation crashes on iOS 26)
 * 4. Fixes preview frame: JS points are not divided by UIScreen.scale; offset by webView.origin
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const pluginRoot = resolve(
  process.cwd(),
  "node_modules/@capacitor-community/camera-preview/ios/Sources/CameraPreviewPlugin",
);

const controllerPath = resolve(pluginRoot, "CameraController.swift");
const pluginPath = resolve(pluginRoot, "CameraPreviewPlugin.swift");

/** Shared Swift block injected into CameraController extension (quality capture). */
const QUALITY_CAPTURE_EXTENSION = `extension CameraController {
    private enum SecondsAppCaptureSettings {
        static let movieMinAverageBitRate = 6_000_000
        static let hdShortSideThreshold: Int32 = 1080
        static let sdShortSideThreshold: Int32 = 720
    }

    private func formatShortSide(for format: AVCaptureDevice.Format) -> Int32 {
        let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        return min(dimensions.width, dimensions.height)
    }

    private func formatPixelCount(for format: AVCaptureDevice.Format) -> Int64 {
        let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        return Int64(dimensions.width) * Int64(dimensions.height)
    }

    private func pickBestCaptureFormat(from formats: [AVCaptureDevice.Format]) -> AVCaptureDevice.Format? {
        guard !formats.isEmpty else { return nil }
        let hdFormats = formats.filter {
            formatShortSide(for: $0) >= SecondsAppCaptureSettings.hdShortSideThreshold
        }
        let sdFormats = formats.filter {
            formatShortSide(for: $0) >= SecondsAppCaptureSettings.sdShortSideThreshold
        }
        let pool = hdFormats.isEmpty ? sdFormats : hdFormats
        if pool.isEmpty {
            return formats.max { lhs, rhs in
                formatPixelCount(for: lhs) < formatPixelCount(for: rhs)
            }
        }
        return pool.max { lhs, rhs in
            let leftPixels = formatPixelCount(for: lhs)
            let rightPixels = formatPixelCount(for: rhs)
            if leftPixels != rightPixels {
                return leftPixels < rightPixels
            }
            return lhs.videoFieldOfView < rhs.videoFieldOfView
        }
    }

    private func configureMovieFileOutput(_ movieOutput: AVCaptureMovieFileOutput) {
        guard let connection = movieOutput.connection(with: .video) else { return }
        let codecs = movieOutput.availableVideoCodecTypes
        guard !codecs.isEmpty else { return }

        let codec: AVVideoCodecType
        if codecs.contains(.hevc) {
            codec = .hevc
        } else if codecs.contains(.h264) {
            codec = .h264
        } else {
            codec = codecs[0]
        }

        let compressionProperties: [String: Any] = [
            AVVideoAverageBitRateKey: NSNumber(value: SecondsAppCaptureSettings.movieMinAverageBitRate),
            AVVideoExpectedSourceFrameRateKey: NSNumber(value: 30),
            AVVideoMaxKeyFrameIntervalKey: NSNumber(value: 30),
        ]
        let outputSettings: [String: Any] = [
            AVVideoCodecKey: codec,
            AVVideoCompressionPropertiesKey: compressionProperties,
        ]
        movieOutput.setOutputSettings(outputSettings, for: connection)
    }

    /// seconds-app: reset zoom and pick highest-resolution format (1080p+, then widest FOV).
    private func applyNaturalPreviewDeviceSettings(to device: AVCaptureDevice) throws {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        device.videoZoomFactor = 1.0
        if let bestFormat = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = bestFormat
        }
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }
    }

    func prepare(cameraPosition: String, disableAudio: Bool, completionHandler: @escaping (Error?) -> Void) {`;

const controllerImportsOld = `import AVFoundation
import UIKit`;

const controllerImportsNew = `import AVFoundation
import CoreMedia
import UIKit`;

const controllerPropertiesOld = `    var zoomFactor: CGFloat = 1.0
}`;

const controllerPropertiesNew = `    var zoomFactor: CGFloat = 1.0

    var movieFileOutput: AVCaptureMovieFileOutput?
    private var startRecordingCompletion: ((Error?) -> Void)?
    private var stopRecordingCompletion: ((URL?, Error?) -> Void)?
    private var _rotationCoordinator: Any?
}`;

const configurePhotoOld = `            if captureSession.canAddOutput(self.photoOutput!) { captureSession.addOutput(self.photoOutput!) }
            captureSession.startRunning()
        }`;

const configurePhotoNew = `            if captureSession.canAddOutput(self.photoOutput!) { captureSession.addOutput(self.photoOutput!) }

            let movieOutput = AVCaptureMovieFileOutput()
            movieOutput.movieFragmentInterval = CMTime.invalid
            if captureSession.canAddOutput(movieOutput) {
                captureSession.addOutput(movieOutput)
                self.movieFileOutput = movieOutput
                self.configureMovieFileOutput(movieOutput)
            }

            captureSession.startRunning()
        }`;

const captureVideoOld = `    func captureVideo(completion: @escaping (URL?, Error?) -> Void) {
        guard let captureSession = self.captureSession, captureSession.isRunning else {
            completion(nil, CameraControllerError.captureSessionIsMissing)
            return
        }
        let path = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let identifier = UUID()
        let randomIdentifier = identifier.uuidString.replacingOccurrences(of: "-", with: "")
        let finalIdentifier = String(randomIdentifier.prefix(8))
        let fileName="cpcp_video_"+finalIdentifier+".mp4"

        let fileUrl = path.appendingPathComponent(fileName)
        try? FileManager.default.removeItem(at: fileUrl)
        /*videoOutput!.startRecording(to: fileUrl, recordingDelegate: self)
         self.videoRecordCompletionBlock = completion*/
    }

    func stopRecording(completion: @escaping (Error?) -> Void) {
        guard let captureSession = self.captureSession, captureSession.isRunning else {
            completion(CameraControllerError.captureSessionIsMissing)
            return
        }
        // self.videoOutput?.stopRecording()
    }
}`;

const captureVideoNew = `    func startRecording(completion: @escaping (Error?) -> Void) {
        guard let captureSession = self.captureSession, captureSession.isRunning else {
            completion(CameraControllerError.captureSessionIsMissing)
            return
        }
        guard let movieOutput = self.movieFileOutput else {
            completion(CameraControllerError.invalidOperation)
            return
        }
        if movieOutput.isRecording {
            completion(CameraControllerError.captureSessionAlreadyRunning)
            return
        }

        let path = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let fileName = "cpcp_video_\\(UUID().uuidString.prefix(8)).mp4"
        let fileUrl = path.appendingPathComponent(fileName)
        try? FileManager.default.removeItem(at: fileUrl)

        updateVideoOrientation()

        self.startRecordingCompletion = completion
        movieOutput.startRecording(to: fileUrl, recordingDelegate: self)
    }

    func stopRecording(completion: @escaping (URL?, Error?) -> Void) {
        guard let captureSession = self.captureSession, captureSession.isRunning else {
            completion(nil, CameraControllerError.captureSessionIsMissing)
            return
        }
        guard let movieOutput = self.movieFileOutput, movieOutput.isRecording else {
            completion(nil, CameraControllerError.invalidOperation)
            return
        }
        self.stopRecordingCompletion = completion
        movieOutput.stopRecording()
    }
}`;

const fileOutputDelegateOld = `extension CameraController: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        /*if error == nil {
         self.videoRecordCompletionBlock?(outputFileURL, nil)
         } else {
         self.videoRecordCompletionBlock?(nil, error)
         }*/
    }
}`;

const fileOutputDelegateNew = `extension CameraController: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        if let completion = startRecordingCompletion {
            startRecordingCompletion = nil
            completion(nil)
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let completion = stopRecordingCompletion {
            stopRecordingCompletion = nil
            if let error = error {
                let nsError = error as NSError
                if nsError.domain == AVFoundationErrorDomain && nsError.code == -11818 && nsError.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool == true {
                    completion(outputFileURL, nil)
                } else {
                    completion(nil, error)
                }
            } else {
                completion(outputFileURL, nil)
            }
        }
    }
}`;

const pluginStartRecordOld = `    @objc func startRecordVideo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {

            let quality: Int? = call.getInt("quality", 85)

            self.cameraController.captureVideo { (image, error) in

                guard let image = image else {
                    print(error ?? "Image capture error")
                    guard let error = error else {
                        call.reject("Image capture error")
                        return
                    }
                    call.reject(error.localizedDescription)
                    return
                }

                // self.videoUrl = image

                call.resolve(["value": image.absoluteString])
            }
        }
    }

    @objc func stopRecordVideo(_ call: CAPPluginCall) {

        self.cameraController.stopRecording { (_) in

        }
    }`;

const pluginStartRecordNew = `    @objc func startRecordVideo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if !(self.cameraController.captureSession?.isRunning ?? false) {
                call.reject("camera is not running")
                return
            }

            self.cameraController.startRecording { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                    return
                }
                call.resolve()
            }
        }
    }

    @objc func stopRecordVideo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.cameraController.stopRecording { url, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                    return
                }
                guard let url = url else {
                    call.reject("Recording failed")
                    return
                }
                var payload: [String: Any] = [
                    "videoFilePath": url.path,
                    "videoFileName": url.lastPathComponent,
                ]
                if let data = try? Data(contentsOf: url), !data.isEmpty {
                    payload["videoBase64"] = data.base64EncodedString()
                    payload["videoFileSize"] = data.count
                }
                call.resolve(payload)
            }
        }
    }`;

const stopRecordVideoPathOnlyOld = `                call.resolve(["videoFilePath": url.path])`;

const stopRecordVideoPathOnlyNew = `                var payload: [String: Any] = [
                    "videoFilePath": url.path,
                    "videoFileName": url.lastPathComponent,
                ]
                if let data = try? Data(contentsOf: url), !data.isEmpty {
                    payload["videoBase64"] = data.base64EncodedString()
                    payload["videoFileSize"] = data.count
                }
                call.resolve(payload)`;

/** Stock plugin (no movieFileOutput line) */
const updateVideoOrientationStockOld = `    func updateVideoOrientation() {
        assert(Thread.isMainThread) // UIKit access requires main thread

        let currentOrientation = UIApplication.shared.connectedScenes
            .first(where: { $0 is UIWindowScene })
            .flatMap({ $0 as? UIWindowScene })?.interfaceOrientation ?? .unknown

        let videoOrientation: AVCaptureVideoOrientation
        switch currentOrientation {
        case .portrait:
            videoOrientation = .portrait
        case .landscapeLeft:
            videoOrientation = .landscapeLeft
        case .landscapeRight:
            videoOrientation = .landscapeRight
        case .portraitUpsideDown:
            videoOrientation = .portraitUpsideDown
        case .unknown:
            fallthrough
        @unknown default:
            videoOrientation = .portrait
        }

        previewLayer?.connection?.videoOrientation = videoOrientation
        dataOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
        photoOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
    }`;

/** Prior patch v1 (movieFileOutput + setVideoOrientation) */
const updateVideoOrientationV1Old = `    func updateVideoOrientation() {
        assert(Thread.isMainThread) // UIKit access requires main thread

        let currentOrientation = UIApplication.shared.connectedScenes
            .first(where: { $0 is UIWindowScene })
            .flatMap({ $0 as? UIWindowScene })?.interfaceOrientation ?? .unknown

        let videoOrientation: AVCaptureVideoOrientation
        switch currentOrientation {
        case .portrait:
            videoOrientation = .portrait
        case .landscapeLeft:
            videoOrientation = .landscapeLeft
        case .landscapeRight:
            videoOrientation = .landscapeRight
        case .portraitUpsideDown:
            videoOrientation = .portraitUpsideDown
        case .unknown:
            fallthrough
        @unknown default:
            videoOrientation = .portrait
        }

        previewLayer?.connection?.videoOrientation = videoOrientation
        dataOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
        photoOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
        movieFileOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
    }`;

const updateVideoOrientationSafeNew = `    private func activeCaptureDevice() -> AVCaptureDevice? {
        switch currentCameraPosition {
        case .front:
            return frontCamera
        case .rear:
            return rearCamera
        default:
            return nil
        }
    }

    @available(iOS 17.0, *)
    private func refreshRotationCoordinator() {
        guard let device = activeCaptureDevice() else {
            _rotationCoordinator = nil
            return
        }
        _rotationCoordinator = AVCaptureDevice.RotationCoordinator(
            device: device,
            previewLayer: previewLayer
        )
    }

    private func applyVideoOrientation(to connection: AVCaptureConnection, interfaceOrientation: UIInterfaceOrientation) {
        if #available(iOS 17.0, *) {
            if let coordinator = _rotationCoordinator as? AVCaptureDevice.RotationCoordinator {
                let isPreviewConnection = connection === previewLayer?.connection
                let angle = isPreviewConnection
                    ? coordinator.videoRotationAngleForHorizonLevelPreview
                    : coordinator.videoRotationAngleForHorizonLevelCapture
                if connection.isVideoRotationAngleSupported(angle) {
                    connection.videoRotationAngle = angle
                }
                // Skip manual mirroring — setVideoMirrored crashes on iOS 26 when
                // automaticallyAdjustsVideoMirroring is still enabled.
                return
            }
            let angle = CameraController.rotationAngle(
                for: interfaceOrientation,
                cameraPosition: currentCameraPosition
            )
            guard connection.isVideoRotationAngleSupported(angle) else { return }
            connection.videoRotationAngle = angle
            return
        }
        guard connection.isVideoOrientationSupported else { return }
        connection.videoOrientation = CameraController.videoOrientation(for: interfaceOrientation)
    }

    private static func rotationAngle(for orientation: UIInterfaceOrientation, cameraPosition: CameraPosition?) -> CGFloat {
        switch orientation {
        case .portrait:
            return cameraPosition == .front ? 270 : 90
        case .landscapeRight:
            return cameraPosition == .front ? 180 : 0
        case .landscapeLeft:
            return cameraPosition == .front ? 0 : 180
        case .portraitUpsideDown:
            return cameraPosition == .front ? 90 : 270
        default:
            return cameraPosition == .front ? 270 : 90
        }
    }

    private static func rotationAngle(for orientation: UIInterfaceOrientation) -> CGFloat {
        return rotationAngle(for: orientation, cameraPosition: nil)
    }

    private static func videoOrientation(for orientation: UIInterfaceOrientation) -> AVCaptureVideoOrientation {
        switch orientation {
        case .portrait:
            return .portrait
        case .landscapeLeft:
            return .landscapeLeft
        case .landscapeRight:
            return .landscapeRight
        case .portraitUpsideDown:
            return .portraitUpsideDown
        default:
            return .portrait
        }
    }

    func updateVideoOrientation() {
        assert(Thread.isMainThread)

        let currentOrientation = UIApplication.shared.connectedScenes
            .first(where: { $0 is UIWindowScene })
            .flatMap({ $0 as? UIWindowScene })?.interfaceOrientation ?? .portrait

        if let connection = previewLayer?.connection {
            applyVideoOrientation(to: connection, interfaceOrientation: currentOrientation)
        }
        dataOutput?.connections.forEach {
            applyVideoOrientation(to: $0, interfaceOrientation: currentOrientation)
        }
        photoOutput?.connections.forEach {
            applyVideoOrientation(to: $0, interfaceOrientation: currentOrientation)
        }
        movieFileOutput?.connections.forEach {
            applyVideoOrientation(to: $0, interfaceOrientation: currentOrientation)
        }
    }`;

/** Prior safe patch without RotationCoordinator / front-camera angles */
const updateVideoOrientationSafeV1Old = `    private func applyVideoOrientation(to connection: AVCaptureConnection, interfaceOrientation: UIInterfaceOrientation) {
        if #available(iOS 17.0, *) {
            let angle = CameraController.rotationAngle(for: interfaceOrientation)
            guard connection.isVideoRotationAngleSupported(angle) else { return }
            connection.videoRotationAngle = angle
            return
        }
        guard connection.isVideoOrientationSupported else { return }
        connection.videoOrientation = CameraController.videoOrientation(for: interfaceOrientation)
    }

    private static func rotationAngle(for orientation: UIInterfaceOrientation) -> CGFloat {
        switch orientation {
        case .portrait:
            return 90
        case .landscapeRight:
            return 0
        case .landscapeLeft:
            return 180
        case .portraitUpsideDown:
            return 270
        default:
            return 90
        }
    }

    private static func videoOrientation(for orientation: UIInterfaceOrientation) -> AVCaptureVideoOrientation {
        switch orientation {
        case .portrait:
            return .portrait
        case .landscapeLeft:
            return .landscapeLeft
        case .landscapeRight:
            return .landscapeRight
        case .portraitUpsideDown:
            return .portraitUpsideDown
        default:
            return .portrait
        }
    }

    func updateVideoOrientation() {
        assert(Thread.isMainThread)

        let currentOrientation = UIApplication.shared.connectedScenes
            .first(where: { $0 is UIWindowScene })
            .flatMap({ $0 as? UIWindowScene })?.interfaceOrientation ?? .portrait

        if let connection = previewLayer?.connection {
            applyVideoOrientation(to: connection, interfaceOrientation: currentOrientation)
        }
        dataOutput?.connections.forEach {
            applyVideoOrientation(to: $0, interfaceOrientation: currentOrientation)
        }
        photoOutput?.connections.forEach {
            applyVideoOrientation(to: $0, interfaceOrientation: currentOrientation)
        }
        movieFileOutput?.connections.forEach {
            applyVideoOrientation(to: $0, interfaceOrientation: currentOrientation)
        }
    }`;

const displayPreviewOrientationOld = `        view.layer.insertSublayer(self.previewLayer!, at: 0)
        self.previewLayer?.frame = view.frame

        updateVideoOrientation()
    }`;

const displayPreviewOrientationNew = `        view.layer.insertSublayer(self.previewLayer!, at: 0)
        self.previewLayer?.frame = view.frame

        if #available(iOS 17.0, *) {
            refreshRotationCoordinator()
        }
        updateVideoOrientation()
    }`;

const switchCamerasOrientationOld = `        captureSession.commitConfiguration()
    }

    func captureImage(completion: @escaping (UIImage?, Error?) -> Void) {`;

const switchCamerasOrientationNew = `        captureSession.commitConfiguration()

        DispatchQueue.main.async {
            if #available(iOS 17.0, *) {
                self.refreshRotationCoordinator()
            }
            self.updateVideoOrientation()
        }
    }

    func captureImage(completion: @escaping (UIImage?, Error?) -> Void) {`;

const controllerPropertiesRotationOld = `    private var stopRecordingCompletion: ((URL?, Error?) -> Void)?
}`;

const controllerPropertiesRotationNew = `    private var stopRecordingCompletion: ((URL?, Error?) -> Void)?
    private var _rotationCoordinator: Any?
}`;

const applyVideoMirroringUnsafeOld = `                if connection.isVideoRotationAngleSupported(angle) {
                    connection.videoRotationAngle = angle
                }
                if connection.isVideoMirroringSupported, isPreviewConnection {
                    connection.isVideoMirrored = (currentCameraPosition == .front)
                }
                return`;

const applyVideoMirroringRemovedNew = `                if connection.isVideoRotationAngleSupported(angle) {
                    connection.videoRotationAngle = angle
                }
                // Skip manual mirroring — setVideoMirrored crashes on iOS 26 when
                // automaticallyAdjustsVideoMirroring is still enabled.
                return`;

const refreshRotationCoordinatorBrokenOld = `    @available(iOS 17.0, *)
    private func refreshRotationCoordinator() {
        guard let device = activeCaptureDevice() else {
            _rotationCoordinator = nil
            return
        }
        if let previewLayer = previewLayer {
            _rotationCoordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: previewLayer)
        } else {
            _rotationCoordinator = AVCaptureDevice.RotationCoordinator(device: device)
        }
    }`;

const refreshRotationCoordinatorFixedNew = `    @available(iOS 17.0, *)
    private func refreshRotationCoordinator() {
        guard let device = activeCaptureDevice() else {
            _rotationCoordinator = nil
            return
        }
        _rotationCoordinator = AVCaptureDevice.RotationCoordinator(
            device: device,
            previewLayer: previewLayer
        )
    }`;

const startRecordingUnsafeOld = `        updateVideoOrientation()
        if let connection = movieOutput.connection(with: .video) {
            connection.videoOrientation = previewLayer?.connection?.videoOrientation ?? .portrait
        }

        self.startRecordingCompletion = completion`;

const startRecordingSafeNew = `        updateVideoOrientation()

        self.startRecordingCompletion = completion`;

const pluginPreviewFrameHelperOld = `    @objc func start(_ call: CAPPluginCall) {
        self.cameraPosition = call.getString("position") ?? "rear"`;

const pluginPreviewFrameHelperNew = `    /// JS getBoundingClientRect (points, WebView-relative) → superview frame for previewView.
    private func previewFrameInSuperview(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) -> CGRect {
        let adjustedHeight = self.paddingBottom != nil ? height - self.paddingBottom! : height
        let origin = self.webView?.frame.origin ?? .zero
        return CGRect(x: origin.x + x, y: origin.y + y, width: width, height: adjustedHeight)
    }

    @objc func start(_ call: CAPPluginCall) {
        self.cameraPosition = call.getString("position") ?? "rear"`;

const pluginCoordsParseOld = `        self.x = call.getInt("x") != nil ? CGFloat(call.getInt("x")!)/UIScreen.main.scale: 0
        self.y = call.getInt("y") != nil ? CGFloat(call.getInt("y")!)/UIScreen.main.scale: 0`;

const pluginCoordsParseNew = `        self.x = call.getInt("x") != nil ? CGFloat(call.getInt("x")!) : 0
        self.y = call.getInt("y") != nil ? CGFloat(call.getInt("y")!) : 0`;

const pluginPreviewViewCreateOld = `                    let adjustedHeight = self.paddingBottom != nil ? height - self.paddingBottom! : height
                    self.previewView = UIView(frame: CGRect(x: self.x ?? 0, y: self.y ?? 0, width: width, height: adjustedHeight))`;

const pluginPreviewViewCreateNew = `                    self.previewView = UIView(frame: self.previewFrameInSuperview(
                        x: self.x ?? 0,
                        y: self.y ?? 0,
                        width: width,
                        height: height
                    ))`;

const pluginRotatedPortraitOld = `        if orientation.isPortrait {
            previewView.frame = CGRect(x: x, y: y, width: min(adjustedHeight, width), height: max(adjustedHeight, width))
            self.cameraController.previewLayer?.frame = previewView.frame
        }`;

const pluginRotatedPortraitNew = `        if orientation.isPortrait {
            let origin = self.webView?.frame.origin ?? .zero
            previewView.frame = CGRect(
                x: origin.x + x,
                y: origin.y + y,
                width: min(adjustedHeight, width),
                height: max(adjustedHeight, width)
            )
            self.cameraController.previewLayer?.frame = previewView.frame
        }`;

async function patchFile(path, replacements, label) {
  let content = await readFile(path, "utf8");
  let changed = false;

  for (const [oldText, newText] of replacements) {
    if (content.includes(newText)) continue;
    if (!content.includes(oldText)) {
      continue;
    }
    content = content.replace(oldText, newText);
    changed = true;
  }

  if (changed) {
    await writeFile(path, content, "utf8");
    console.log(`[patch-camera-preview-ios] patched ${label}`);
  } else {
    console.log(`[patch-camera-preview-ios] ${label} already patched`);
  }

  return content;
}

let controller = await readFile(controllerPath, "utf8");

await patchFile(
  controllerPath,
  [[controllerImportsOld, controllerImportsNew]],
  "CameraController.swift (CoreMedia import)",
);

await patchFile(
  controllerPath,
  [
    [controllerPropertiesOld, controllerPropertiesNew],
    [configurePhotoOld, configurePhotoNew],
    [captureVideoOld, captureVideoNew],
    [fileOutputDelegateOld, fileOutputDelegateNew],
  ],
  "CameraController.swift (recording)",
);

controller = await readFile(controllerPath, "utf8");

if (controller.includes("refreshRotationCoordinator()")) {
  console.log("[patch-camera-preview-ios] orientation v2 already present");
} else if (controller.includes("applyVideoOrientation(to connection:")) {
  if (controller.includes(updateVideoOrientationSafeV1Old)) {
    await patchFile(
      controllerPath,
      [[updateVideoOrientationSafeV1Old, updateVideoOrientationSafeNew]],
      "CameraController.swift (orientation v1→v2)",
    );
  } else {
    console.warn(
      "[patch-camera-preview-ios] skip v2 upgrade: applyVideoOrientation present but v1 block not matched",
    );
  }
} else if (controller.includes(updateVideoOrientationV1Old)) {
  await patchFile(
    controllerPath,
    [[updateVideoOrientationV1Old, updateVideoOrientationSafeNew]],
    "CameraController.swift (orientation v1→safe)",
  );
} else if (controller.includes(updateVideoOrientationStockOld)) {
  await patchFile(
    controllerPath,
    [[updateVideoOrientationStockOld, updateVideoOrientationSafeNew]],
    "CameraController.swift (orientation stock→safe)",
  );
} else {
  console.warn(
    "[patch-camera-preview-ios] skip orientation: updateVideoOrientation pattern not found",
  );
}

controller = await readFile(controllerPath, "utf8");
if (controller.includes(startRecordingUnsafeOld)) {
  await patchFile(
    controllerPath,
    [[startRecordingUnsafeOld, startRecordingSafeNew]],
    "CameraController.swift (startRecording orientation)",
  );
}

controller = await readFile(controllerPath, "utf8");
await patchFile(
  controllerPath,
  [
    [controllerPropertiesRotationOld, controllerPropertiesRotationNew],
    [displayPreviewOrientationOld, displayPreviewOrientationNew],
    [switchCamerasOrientationOld, switchCamerasOrientationNew],
  ],
  "CameraController.swift (front camera orientation)",
);

await patchFile(
  controllerPath,
  [[refreshRotationCoordinatorBrokenOld, refreshRotationCoordinatorFixedNew]],
  "CameraController.swift (RotationCoordinator init fix)",
);

await patchFile(
  controllerPath,
  [[applyVideoMirroringUnsafeOld, applyVideoMirroringRemovedNew]],
  "CameraController.swift (remove unsafe video mirroring)",
);

await patchFile(
  pluginPath,
  [[pluginStartRecordOld, pluginStartRecordNew]],
  "CameraPreviewPlugin.swift",
);

await patchFile(
  pluginPath,
  [[stopRecordVideoPathOnlyOld, stopRecordVideoPathOnlyNew]],
  "CameraPreviewPlugin.swift (stopRecordVideo base64)",
);

await patchFile(
  pluginPath,
  [
    [pluginPreviewFrameHelperOld, pluginPreviewFrameHelperNew],
    [pluginCoordsParseOld, pluginCoordsParseNew],
    [pluginPreviewViewCreateOld, pluginPreviewViewCreateNew],
    [pluginRotatedPortraitOld, pluginRotatedPortraitNew],
  ],
  "CameraPreviewPlugin.swift (preview frame coordinates)",
);

const videoGravityFillToken = "AVLayerVideoGravity.resizeAspectFill";
const videoGravityAspectToken = "AVLayerVideoGravity.resizeAspect";

let controllerForGravity = await readFile(controllerPath, "utf8");
if (controllerForGravity.includes(videoGravityFillToken)) {
  controllerForGravity = controllerForGravity.replaceAll(
    videoGravityFillToken,
    videoGravityAspectToken,
  );
  await writeFile(controllerPath, controllerForGravity, "utf8");
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (preview aspect-fit)",
  );
} else if (controllerForGravity.includes(videoGravityAspectToken)) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (preview aspect-fit) already patched",
  );
} else {
  console.warn(
    "[patch-camera-preview-ios] skip preview aspect-fit: videoGravity assignment not found",
  );
}

const naturalPreviewHelperOld = `}

extension CameraController {
    func prepare(cameraPosition: String, disableAudio: Bool, completionHandler: @escaping (Error?) -> Void) {`;

const naturalPreviewHelperNew = `}

${QUALITY_CAPTURE_EXTENSION}`;

const createCaptureSessionOld = `        func createCaptureSession() {
            self.captureSession = AVCaptureSession()
        }`;

const createCaptureSessionNew = `        func createCaptureSession() {
            self.captureSession = AVCaptureSession()
            if let session = self.captureSession, session.canSetSessionPreset(.hd1920x1080) {
                session.sessionPreset = .hd1920x1080
            } else {
                self.captureSession?.sessionPreset = .high
            }
        }`;

const configureCaptureDevicesOld = `        func configureCaptureDevices() throws {

            let session = AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera], mediaType: AVMediaType.video, position: .unspecified)

            let cameras = session.devices.compactMap { $0 }
            guard !cameras.isEmpty else { throw CameraControllerError.noCamerasAvailable }

            for camera in cameras {
                if camera.position == .front {
                    self.frontCamera = camera
                }

                if camera.position == .back {
                    self.rearCamera = camera

                    try camera.lockForConfiguration()
                    camera.focusMode = .continuousAutoFocus
                    camera.unlockForConfiguration()
                }
            }`;

const configureCaptureDevicesNew = `        func configureCaptureDevices() throws {
            let discovery = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.builtInWideAngleCamera],
                mediaType: .video,
                position: .unspecified
            )
            let discovered = discovery.devices
            guard !discovered.isEmpty else { throw CameraControllerError.noCamerasAvailable }

            self.frontCamera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
                ?? discovered.first(where: { $0.position == .front })
            self.rearCamera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
                ?? discovered.first(where: { $0.position == .back })

            guard self.frontCamera != nil || self.rearCamera != nil else {
                throw CameraControllerError.noCamerasAvailable
            }

            if let front = self.frontCamera {
                try self.applyNaturalPreviewDeviceSettings(to: front)
            }
            if let rear = self.rearCamera {
                try self.applyNaturalPreviewDeviceSettings(to: rear)
            }`;

const displayPreviewFrameOld = `        view.layer.insertSublayer(self.previewLayer!, at: 0)
        self.previewLayer?.frame = view.frame`;

const displayPreviewFrameNew = `        view.layer.insertSublayer(self.previewLayer!, at: 0)
        self.syncPreviewLayerFrame(in: view)`;

const syncPreviewLayerFrameOld = `    func displayPreview(on view: UIView) throws {
        guard let captureSession = self.captureSession, captureSession.isRunning else { throw CameraControllerError.captureSessionIsMissing }`;

const syncPreviewLayerFrameNew = `    func syncPreviewLayerFrame(in view: UIView) {
        guard let previewLayer = self.previewLayer else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        previewLayer.frame = view.bounds
        CATransaction.commit()
    }

    func displayPreview(on view: UIView) throws {
        guard let captureSession = self.captureSession, captureSession.isRunning else { throw CameraControllerError.captureSessionIsMissing }`;

const displayPreviewFrameBoundsOnlyOld = `        view.layer.insertSublayer(self.previewLayer!, at: 0)
        self.previewLayer?.frame = view.bounds`;

const displayPreviewFrameWithMaskOld = `        view.layer.insertSublayer(self.previewLayer!, at: 0)
        self.previewLayer?.frame = view.bounds
        self.previewLayer?.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]`;

const displayPreviewFrameFlexibleMaskOld = `        view.layer.insertSublayer(self.previewLayer!, at: 0)
        self.previewLayer?.frame = view.bounds
        self.previewLayer?.autoresizingMask = [.flexibleWidth, .flexibleHeight]`;

const switchCamerasCommitOld = `        captureSession.commitConfiguration()

        DispatchQueue.main.async {
            if #available(iOS 17.0, *) {
                self.refreshRotationCoordinator()
            }
            self.updateVideoOrientation()
        }
    }`;

const switchCamerasCommitNew = `        captureSession.commitConfiguration()

        if let device = self.activeCaptureDevice() {
            try? self.applyNaturalPreviewDeviceSettings(to: device)
        }

        DispatchQueue.main.async {
            if #available(iOS 17.0, *) {
                self.refreshRotationCoordinator()
            }
            self.updateVideoOrientation()
        }
    }`;

await patchFile(
  controllerPath,
  [
    [naturalPreviewHelperOld, naturalPreviewHelperNew],
    [createCaptureSessionOld, createCaptureSessionNew],
    [configureCaptureDevicesOld, configureCaptureDevicesNew],
    [syncPreviewLayerFrameOld, syncPreviewLayerFrameNew],
    [displayPreviewFrameOld, displayPreviewFrameNew],
    [displayPreviewFrameBoundsOnlyOld, displayPreviewFrameNew],
    [displayPreviewFrameWithMaskOld, displayPreviewFrameNew],
    [displayPreviewFrameFlexibleMaskOld, displayPreviewFrameNew],
    [switchCamerasCommitOld, switchCamerasCommitNew],
  ],
  "CameraController.swift (natural preview FOV)",
);

// Strip any leftover CALayer.autoresizingMask assignments (unavailable on iOS).
let controllerAfterPatches = await readFile(controllerPath, "utf8");
const strippedController = controllerAfterPatches.replace(
  /[ \t]*self\.previewLayer\?\.autoresizingMask = \[[^\]]+\]\r?\n/g,
  "",
);
if (strippedController !== controllerAfterPatches) {
  await writeFile(controllerPath, strippedController, "utf8");
  console.log(
    "[patch-camera-preview-ios] removed previewLayer.autoresizingMask (unavailable on iOS)",
  );
}

const pluginHostViewInsertOld = `import UIKit

/**
 * Please read the Capacitor iOS Plugin Development Guide
 * here: https://capacitor.ionicframework.com/docs/plugins/ios
 */
@objc(CameraPreview)`;

const pluginHostViewInsertNew = `import UIKit

/// seconds-app: resizes preview layer in layoutSubviews (CALayer.autoresizingMask is unavailable on iOS).
private final class CameraPreviewHostView: UIView {
    weak var cameraController: CameraController?

    override func layoutSubviews() {
        super.layoutSubviews()
        if let cameraController = cameraController {
            cameraController.syncPreviewLayerFrame(in: self)
        }
    }
}

/**
 * Please read the Capacitor iOS Plugin Development Guide
 * here: https://capacitor.ionicframework.com/docs/plugins/ios
 */
@objc(CameraPreview)`;

const pluginPreviewHostViewOld = `                    self.previewView = UIView(frame: self.previewFrameInSuperview(
                        x: self.x ?? 0,
                        y: self.y ?? 0,
                        width: width,
                        height: height
                    ))`;

const pluginPreviewHostViewNew = `                    let host = CameraPreviewHostView(frame: self.previewFrameInSuperview(
                        x: self.x ?? 0,
                        y: self.y ?? 0,
                        width: width,
                        height: height
                    ))
                    host.cameraController = self.cameraController
                    self.previewView = host`;

const pluginRotatedLayerFrameOld = `self.cameraController.previewLayer?.frame = previewView.frame`;

const pluginRotatedLayerFrameNew = `self.cameraController.syncPreviewLayerFrame(in: previewView)`;

await patchFile(
  pluginPath,
  [
    [pluginHostViewInsertOld, pluginHostViewInsertNew],
    [pluginPreviewHostViewOld, pluginPreviewHostViewNew],
    [pluginRotatedLayerFrameOld, pluginRotatedLayerFrameNew],
  ],
  "CameraPreviewPlugin.swift (preview host layoutSubviews)",
);

// rotated() has landscape + portrait branches — replace all direct frame assignments.
let pluginAfterPatches = await readFile(pluginPath, "utf8");
const directFrameAssign =
  /self\.cameraController\.previewLayer\?\.frame = previewView\.frame/g;
const fixedPlugin = pluginAfterPatches.replace(
  directFrameAssign,
  "self.cameraController.syncPreviewLayerFrame(in: previewView)",
);
if (fixedPlugin !== pluginAfterPatches) {
  await writeFile(pluginPath, fixedPlugin, "utf8");
  console.log(
    "[patch-camera-preview-ios] replaced remaining previewLayer.frame assignments in CameraPreviewPlugin.swift",
  );
}

// ── Quality upgrade (v1 widest-FOV → v2 resolution scoring) ─────────────────

const naturalPreviewQualityV1Old = `extension CameraController {
    /// seconds-app: reset zoom and pick widest field-of-view format.
    private func applyNaturalPreviewDeviceSettings(to device: AVCaptureDevice) throws {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        device.videoZoomFactor = 1.0
        if let widest = device.formats.max(by: { $0.videoFieldOfView < $1.videoFieldOfView }) {
            device.activeFormat = widest
        }
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }
    }

    func prepare(cameraPosition: String, disableAudio: Bool, completionHandler: @escaping (Error?) -> Void) {`;

const naturalPreviewQualityV2New = QUALITY_CAPTURE_EXTENSION;

await patchFile(
  controllerPath,
  [[naturalPreviewQualityV1Old, naturalPreviewQualityV2New]],
  "CameraController.swift (quality v1→v2 format scoring)",
);

const naturalPreviewQualityV2BrokenOld = `extension CameraController {
    private static let movieMinAverageBitRate = 6_000_000

    private func formatDimensions(_ format: AVCaptureDevice.Format) -> CMVideoDimensions {
        CMVideoFormatDescriptionGetDimensions(format.formatDescription)
    }

    private func formatShortSide(_ format: AVCaptureDevice.Format) -> Int32 {
        let dimensions = formatDimensions(format)
        return min(dimensions.width, dimensions.height)
    }

    private func formatPixelCount(_ format: AVCaptureDevice.Format) -> Int64 {
        let dimensions = formatDimensions(format)
        return Int64(dimensions.width) * Int64(dimensions.height)
    }

    private func pickBestCaptureFormat(from formats: [AVCaptureDevice.Format]) -> AVCaptureDevice.Format? {
        guard !formats.isEmpty else { return nil }
        let hdFormats = formats.filter { formatShortSide($0) >= 1080 }
        let sdFormats = formats.filter { formatShortSide($0) >= 720 }
        let pool = hdFormats.isEmpty ? sdFormats : hdFormats
        if pool.isEmpty {
            return formats.max(by: { formatPixelCount($0) < formatPixelCount($1) })
        }
        return pool.max(by: { left, right in
            let leftPixels = formatPixelCount(left)
            let rightPixels = formatPixelCount(right)
            if leftPixels != rightPixels {
                return leftPixels < rightPixels
            }
            return left.videoFieldOfView < right.videoFieldOfView
        })
    }

    private func configureMovieFileOutput(_ movieOutput: AVCaptureMovieFileOutput) {
        guard let connection = movieOutput.connection(with: .video) else { return }
        let codecs = movieOutput.availableVideoCodecTypes(for: connection)
        guard !codecs.isEmpty else { return }

        let codec: AVVideoCodecType
        if codecs.contains(.hevc) {
            codec = .hevc
        } else if codecs.contains(.h264) {
            codec = .h264
        } else {
            codec = codecs[0]
        }

        let compressionProperties: [String: Any] = [
            AVVideoAverageBitRateKey: NSNumber(value: CameraController.movieMinAverageBitRate),
            AVVideoExpectedSourceFrameRateKey: NSNumber(value: 30),
            AVVideoMaxKeyFrameIntervalKey: NSNumber(value: 30),
        ]
        let outputSettings: [String: Any] = [
            AVVideoCodecKey: codec,
            AVVideoCompressionPropertiesKey: compressionProperties,
        ]
        movieOutput.setOutputSettings(outputSettings, for: connection)
    }

    /// seconds-app: reset zoom and pick highest-resolution format (1080p+, then widest FOV).
    private func applyNaturalPreviewDeviceSettings(to device: AVCaptureDevice) throws {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        device.videoZoomFactor = 1.0
        if let bestFormat = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = bestFormat
        }
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }
    }

    func prepare(cameraPosition: String, disableAudio: Bool, completionHandler: @escaping (Error?) -> Void) {`;

const naturalPreviewQualityV3FixedNew = QUALITY_CAPTURE_EXTENSION;

await patchFile(
  controllerPath,
  [[naturalPreviewQualityV2BrokenOld, naturalPreviewQualityV3FixedNew]],
  "CameraController.swift (quality v2→v3 compile fixes)",
);

const sessionPresetV1Old = `            self.captureSession?.sessionPreset = .high`;
const sessionPresetV2New = `            if let session = self.captureSession, session.canSetSessionPreset(.hd1920x1080) {
                session.sessionPreset = .hd1920x1080
            } else {
                self.captureSession?.sessionPreset = .high
            }`;

await patchFile(
  controllerPath,
  [[sessionPresetV1Old, sessionPresetV2New]],
  "CameraController.swift (session preset hd1920x1080)",
);

const configureMovieOutputV1Old = `            let movieOutput = AVCaptureMovieFileOutput()
            movieOutput.movieFragmentInterval = CMTime.invalid
            if captureSession.canAddOutput(movieOutput) {
                captureSession.addOutput(movieOutput)
                self.movieFileOutput = movieOutput
            }`;

const configureMovieOutputV2New = `            let movieOutput = AVCaptureMovieFileOutput()
            movieOutput.movieFragmentInterval = CMTime.invalid
            if captureSession.canAddOutput(movieOutput) {
                captureSession.addOutput(movieOutput)
                self.movieFileOutput = movieOutput
                self.configureMovieFileOutput(movieOutput)
            }`;

await patchFile(
  controllerPath,
  [[configureMovieOutputV1Old, configureMovieOutputV2New]],
  "CameraController.swift (movie output bitrate)",
);

const formatPixelCountTypoOld = `formatPixelCount(for: $0) < formatPixelCount(for: $1)`;
const formatPixelCountTypoNew = `formatPixelCount($0) < formatPixelCount($1)`;

let controllerForTypoFix = await readFile(controllerPath, "utf8");
if (controllerForTypoFix.includes(formatPixelCountTypoOld)) {
  controllerForTypoFix = controllerForTypoFix.replaceAll(
    formatPixelCountTypoOld,
    formatPixelCountTypoNew,
  );
  await writeFile(controllerPath, controllerForTypoFix, "utf8");
  console.log(
    "[patch-camera-preview-ios] fixed formatPixelCount call syntax",
  );
}

const handleTapGravityAnchorOld = `    @objc
    func handleTap(_ tap: UITapGestureRecognizer) {`;

const handleTapGravityAnchorNew = `    /// seconds-app: aspect-fit at 1×; aspect-fill when zoomed so letterbox never shows through scrim holes.
    func syncPreviewVideoGravity(forZoomFactor factor: CGFloat) {
        guard let layer = self.previewLayer else { return }
        let gravity: AVLayerVideoGravity = factor > 1.01 ? .resizeAspectFill : .resizeAspect
        if layer.videoGravity != gravity {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.videoGravity = gravity
            CATransaction.commit()
        }
    }

    @objc
    func handleTap(_ tap: UITapGestureRecognizer) {`;

let controllerBeforeGravity = await readFile(controllerPath, "utf8");
if (!controllerBeforeGravity.includes("func syncPreviewVideoGravity(forZoomFactor")) {
  await patchFile(
    controllerPath,
    [[handleTapGravityAnchorOld, handleTapGravityAnchorNew]],
    "CameraController.swift (zoom preview gravity helper)",
  );
} else {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (zoom preview gravity helper) already patched",
  );
}

const handlePinchGravityOld = `        switch pinch.state {
        case .began: fallthrough
        case .changed:
            let newScaleFactor = minMaxZoom(pinch.scale * zoomFactor)
            update(scale: newScaleFactor)
        case .ended:
            zoomFactor = device.videoZoomFactor
        default: break
        }`;

const handlePinchGravityNew = `        switch pinch.state {
        case .began: fallthrough
        case .changed:
            let newScaleFactor = minMaxZoom(pinch.scale * zoomFactor)
            update(scale: newScaleFactor)
            syncPreviewVideoGravity(forZoomFactor: newScaleFactor)
        case .ended:
            zoomFactor = device.videoZoomFactor
            syncPreviewVideoGravity(forZoomFactor: device.videoZoomFactor)
        default: break
        }`;

await patchFile(
  controllerPath,
  [[handlePinchGravityOld, handlePinchGravityNew]],
  "CameraController.swift (pinch sync preview gravity)",
);

const {
  FOCUS_LENS_CONTROLLER_EXTENSION,
  FOCUS_LENS_CONTROLLER_EXTENSION_V1,
  FOCUS_LENS_CONTROLLER_PATCHES,
  FOCUS_LENS_PLUGIN_HANDLERS,
  FOCUS_LENS_PLUGIN_INSERT_BEFORE,
  FOCUS_LENS_PLUGIN_METHODS_NEW,
  FOCUS_LENS_PLUGIN_METHODS_OLD,
} = await import("./camera-preview-ios-focus-lens.mjs");

await patchFile(
  controllerPath,
  FOCUS_LENS_CONTROLLER_PATCHES,
  "CameraController.swift (focus + lens patches)",
);

const gestureDelegateExtensionAnchor = `extension CameraController: UIGestureRecognizerDelegate {`;
let controllerForFocusLens = await readFile(controllerPath, "utf8");
if (
  controllerForFocusLens.includes("func setFocusAtNormalizedPoint") &&
  !controllerForFocusLens.includes("func logRearCameraDiagnostics") &&
  controllerForFocusLens.includes(FOCUS_LENS_CONTROLLER_EXTENSION_V1.trim())
) {
  controllerForFocusLens = controllerForFocusLens.replace(
    FOCUS_LENS_CONTROLLER_EXTENSION_V1,
    FOCUS_LENS_CONTROLLER_EXTENSION,
  );
  await writeFile(controllerPath, controllerForFocusLens, "utf8");
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (focus+lens v1→v2 display zoom)",
  );
  controllerForFocusLens = await readFile(controllerPath, "utf8");
}
if (
  !controllerForFocusLens.includes("func setFocusAtNormalizedPoint") &&
  controllerForFocusLens.includes(gestureDelegateExtensionAnchor)
) {
  controllerForFocusLens = controllerForFocusLens.replace(
    gestureDelegateExtensionAnchor,
    `${FOCUS_LENS_CONTROLLER_EXTENSION}\n${gestureDelegateExtensionAnchor}`,
  );
  await writeFile(controllerPath, controllerForFocusLens, "utf8");
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (focus + lens extension)",
  );
} else if (controllerForFocusLens.includes("func setFocusAtNormalizedPoint")) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (focus + lens extension) already patched",
  );
} else {
  console.warn(
    "[patch-camera-preview-ios] skip focus + lens extension: anchor not found",
  );
}

let pluginForFocusLens = await readFile(pluginPath, "utf8");
if (!pluginForFocusLens.includes('CAPPluginMethod(name: "setFocusPoint"')) {
  if (pluginForFocusLens.includes(FOCUS_LENS_PLUGIN_METHODS_OLD)) {
    pluginForFocusLens = pluginForFocusLens.replace(
      FOCUS_LENS_PLUGIN_METHODS_OLD,
      FOCUS_LENS_PLUGIN_METHODS_NEW,
    );
  }
  if (
    pluginForFocusLens.includes(FOCUS_LENS_PLUGIN_INSERT_BEFORE) &&
    !pluginForFocusLens.includes("@objc func setFocusPoint")
  ) {
    pluginForFocusLens = pluginForFocusLens.replace(
      FOCUS_LENS_PLUGIN_INSERT_BEFORE,
      `${FOCUS_LENS_PLUGIN_HANDLERS}\n    ${FOCUS_LENS_PLUGIN_INSERT_BEFORE}`,
    );
  }
  await writeFile(pluginPath, pluginForFocusLens, "utf8");
  console.log("[patch-camera-preview-ios] CameraPreviewPlugin.swift (focus + lens API)");
} else {
  console.log(
    "[patch-camera-preview-ios] CameraPreviewPlugin.swift (focus + lens API) already patched",
  );
}

const duplicatePrivateGravityOld = `    /// seconds-app: aspect-fit at 1×; aspect-fill when zoomed so letterbox never shows through scrim holes.
    private func syncPreviewVideoGravity(forZoomFactor factor: CGFloat) {
        guard let layer = self.previewLayer else { return }
        let gravity: AVLayerVideoGravity = factor > 1.01 ? .resizeAspectFill : .resizeAspect
        if layer.videoGravity != gravity {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.videoGravity = gravity
            CATransaction.commit()
        }
    }

`;

const duplicatePublicGravityOld = `    /// seconds-app: aspect-fit at 1×; aspect-fill when zoomed so letterbox never shows through scrim holes.
    func syncPreviewVideoGravity(forZoomFactor factor: CGFloat) {
        guard let layer = self.previewLayer else { return }
        let gravity: AVLayerVideoGravity = factor > 1.01 ? .resizeAspectFill : .resizeAspect
        if layer.videoGravity != gravity {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.videoGravity = gravity
            CATransaction.commit()
        }
    }

`;

let controllerDedup = await readFile(controllerPath, "utf8");
let dedupChanged = false;
if (controllerDedup.includes(duplicatePrivateGravityOld)) {
  controllerDedup = controllerDedup.replace(duplicatePrivateGravityOld, "");
  dedupChanged = true;
  console.log(
    "[patch-camera-preview-ios] removed duplicate private syncPreviewVideoGravity",
  );
}
while (controllerDedup.split(duplicatePublicGravityOld).length > 2) {
  const first = controllerDedup.indexOf(duplicatePublicGravityOld);
  const second = controllerDedup.indexOf(
    duplicatePublicGravityOld,
    first + duplicatePublicGravityOld.length,
  );
  if (second < 0) break;
  controllerDedup =
    controllerDedup.slice(0, second) +
    controllerDedup.slice(second + duplicatePublicGravityOld.length);
  dedupChanged = true;
  console.log(
    "[patch-camera-preview-ios] removed duplicate public syncPreviewVideoGravity",
  );
}
if (dedupChanged) {
  await writeFile(controllerPath, controllerDedup, "utf8");
}
