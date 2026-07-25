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

/**
 * Shared Swift block injected into CameraController (quality capture).
 *
 * v4 (fix b5d9681): target shortSide ≈ 1080 with longSide ≤ 1920 — never pick 4K
 * max-pixel formats. Prefer H.264 over HEVC so capture stays light enough for 30fps.
 * v5: lock activeVideoMin/MaxFrameDuration to 30fps (CFR) — VFR was recording at ~18fps under load.
 */
const QUALITY_CAPTURE_EXTENSION = `extension CameraController {
    private enum SecondsAppCaptureSettings {
        /// 1080p30 H.264: ~5–8 Mbps is typical; 6 Mbps keeps quality without overload.
        static let movieMinAverageBitRate = 6_000_000
        static let targetShortSide: Int32 = 1080
        static let maxLongSide: Int32 = 1920
        static let minShortSide: Int32 = 720
        static let targetFrameRate: Int32 = 30
    }

    private func formatDimensions(for format: AVCaptureDevice.Format) -> CMVideoDimensions {
        CMVideoFormatDescriptionGetDimensions(format.formatDescription)
    }

    private func formatShortSide(for format: AVCaptureDevice.Format) -> Int32 {
        let dimensions = formatDimensions(for: format)
        return min(dimensions.width, dimensions.height)
    }

    private func formatLongSide(for format: AVCaptureDevice.Format) -> Int32 {
        let dimensions = formatDimensions(for: format)
        return max(dimensions.width, dimensions.height)
    }

    /// True when the format can lock both min and max duration to exactly 30fps (CFR).
    private func formatSupportsLocked30Fps(_ format: AVCaptureDevice.Format) -> Bool {
        format.videoSupportedFrameRateRanges.contains { range in
            range.minFrameRate <= 30.0 && range.maxFrameRate >= 29.0
        }
    }

    /// Call while device is already lockedForConfiguration.
    private func applyLocked30FpsFrameRate(to device: AVCaptureDevice) {
        guard formatSupportsLocked30Fps(device.activeFormat) else { return }
        let duration = CMTime(value: 1, timescale: SecondsAppCaptureSettings.targetFrameRate)
        device.activeVideoMinFrameDuration = duration
        device.activeVideoMaxFrameDuration = duration
    }

    private func frameRate(from duration: CMTime) -> Double {
        guard duration.value > 0 else { return 0 }
        return Double(duration.timescale) / Double(duration.value)
    }

    private func logActiveFrameRate(context: String, device: AVCaptureDevice) {
        let minFps = frameRate(from: device.activeVideoMinFrameDuration)
        let maxFps = frameRate(from: device.activeVideoMaxFrameDuration)
        print(
            "[seconds-app-camera] \\(context) activeVideoMinFrameDuration fps=\\(String(format: "%.2f", minFps)) activeVideoMaxFrameDuration fps=\\(String(format: "%.2f", maxFps)) suppressGestures=\\(suppressRecordingGestures)"
        )
    }

    private func lockFocusAndExposureForRecording(on device: AVCaptureDevice) {
        if device.isFocusModeSupported(.locked) {
            device.focusMode = .locked
        }
        if device.isExposureModeSupported(.locked) {
            device.exposureMode = .locked
        }
    }

    private func restoreContinuousFocusAndExposure() {
        guard let device = activeCaptureDevice() else { return }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            if device.isFocusModeSupported(.continuousAutoFocus) {
                device.focusMode = .continuousAutoFocus
            }
            if device.isExposureModeSupported(.continuousAutoExposure) {
                device.exposureMode = .continuousAutoExposure
            }
        } catch {
            debugPrint(error)
        }
    }

    /// Re-apply 30fps lock + AE/AF lock immediately before MovieFileOutput starts.
    private func prepareDeviceForRecording() {
        guard let device = activeCaptureDevice() else { return }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            applyLocked30FpsFrameRate(to: device)
            lockFocusAndExposureForRecording(on: device)
            logActiveFrameRate(context: "before startRecording", device: device)
        } catch {
            debugPrint(error)
        }
    }

    /// Pick ~1080p (short ≈ 1080, long ≤ 1920) that can lock 30fps CFR. Never prefer 4K / max pixels.
    private func pickBestCaptureFormat(from formats: [AVCaptureDevice.Format]) -> AVCaptureDevice.Format? {
        guard !formats.isEmpty else { return nil }

        let targetShort = SecondsAppCaptureSettings.targetShortSide
        let maxLong = SecondsAppCaptureSettings.maxLongSide
        let minShort = SecondsAppCaptureSettings.minShortSide

        let locked30 = formats.filter { formatSupportsLocked30Fps($0) }
        let withinCap = locked30.filter { formatLongSide(for: $0) <= maxLong }
        // Prefer locked-30 + within 1920; fall back to any locked-30; last resort all formats.
        let search = withinCap.isEmpty ? (locked30.isEmpty ? formats : locked30) : withinCap

        return search.min { lhs, rhs in
            let leftLong = formatLongSide(for: lhs)
            let rightLong = formatLongSide(for: rhs)
            let leftOverCap = leftLong > maxLong
            let rightOverCap = rightLong > maxLong
            if leftOverCap != rightOverCap {
                return !leftOverCap
            }

            let leftLocked = formatSupportsLocked30Fps(lhs)
            let rightLocked = formatSupportsLocked30Fps(rhs)
            if leftLocked != rightLocked {
                return leftLocked
            }

            let leftShort = formatShortSide(for: lhs)
            let rightShort = formatShortSide(for: rhs)
            let leftDist = abs(Int(leftShort) - Int(targetShort))
            let rightDist = abs(Int(rightShort) - Int(targetShort))
            if leftDist != rightDist {
                return leftDist < rightDist
            }

            // Prefer short side in [720, 1080] over taller crops (e.g. 1440).
            let leftInBand = leftShort >= minShort && leftShort <= targetShort
            let rightInBand = rightShort >= minShort && rightShort <= targetShort
            if leftInBand != rightInBand {
                return leftInBand
            }

            // Prefer wider FOV for a natural preview.
            return lhs.videoFieldOfView > rhs.videoFieldOfView
        }
    }

    private func configureMovieFileOutput(_ movieOutput: AVCaptureMovieFileOutput) {
        guard let connection = movieOutput.connection(with: .video) else { return }
        let codecs = movieOutput.availableVideoCodecTypes
        guard !codecs.isEmpty else { return }

        // H.264 first — HEVC + high-res capture was dropping frames on device.
        let codec: AVVideoCodecType
        if codecs.contains(.h264) {
            codec = .h264
        } else if codecs.contains(.hevc) {
            codec = .hevc
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

    /// Prefer a format that keeps ultra-wide (raw ≈ 1.0) reachable when hardware has it.
    private func ensureUltraWideZoomRange(on device: AVCaptureDevice) {
        guard device.constituentDevices.contains(where: { $0.deviceType == .builtInUltraWideCamera }),
              device.minAvailableVideoZoomFactor > 1.05 else { return }
        let locked = device.formats.filter { formatSupportsLocked30Fps($0) }
        let pool = locked.isEmpty ? device.formats : locked
        var restored = false
        for format in pool {
            device.activeFormat = format
            applyLocked30FpsFrameRate(to: device)
            if device.minAvailableVideoZoomFactor <= 1.05 {
                restored = true
                break
            }
        }
        if !restored, let fallback = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = fallback
            applyLocked30FpsFrameRate(to: device)
        }
    }

    /// seconds-app: reset zoom and pick ~1080p format (long side ≤ 1920), lock 30fps CFR.
    private func applyNaturalPreviewDeviceSettings(to device: AVCaptureDevice) throws {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        device.videoZoomFactor = 1.0
        if let bestFormat = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = bestFormat
        }
        applyLocked30FpsFrameRate(to: device)
        ensureUltraWideZoomRange(on: device)
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }
        logActiveFrameRate(context: "after applyNaturalPreviewDeviceSettings", device: device)
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
    /// When true, ignore tap-focus during MovieFileOutput recording (AE/AF stay locked).
    /// Pinch / setZoom remain allowed — zoom is a brief load vs continuous AF hunting.
    private var suppressRecordingGestures = false
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
        prepareDeviceForRecording()
        suppressRecordingGestures = true

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
        suppressRecordingGestures = false
        restoreContinuousFocusAndExposure()
        if let device = activeCaptureDevice() {
            logActiveFrameRate(context: "after stopRecording", device: device)
        }
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

// Circle-hole preview: always aspect-fill so letterbox never shows through the scrim.
// IMPORTANT: "resizeAspect" is a prefix of "resizeAspectFill" — never replaceAll the short token.
const videoGravityDisplayFill =
  "previewLayer?.videoGravity = AVLayerVideoGravity.resizeAspectFill";

let controllerForGravity = await readFile(controllerPath, "utf8");
const gravityBefore = controllerForGravity;

// Repair accidental FillFill… from a previous prefix-replace bug.
while (controllerForGravity.includes("AVLayerVideoGravity.resizeAspectFillFill")) {
  controllerForGravity = controllerForGravity.replaceAll(
    "AVLayerVideoGravity.resizeAspectFillFill",
    "AVLayerVideoGravity.resizeAspectFill",
  );
}

controllerForGravity = controllerForGravity.replace(
  /previewLayer\?\.videoGravity = AVLayerVideoGravity\.resizeAspect(?!Fill)/g,
  videoGravityDisplayFill,
);

if (controllerForGravity !== gravityBefore) {
  await writeFile(controllerPath, controllerForGravity, "utf8");
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (preview aspect-fill)",
  );
} else if (controllerForGravity.includes(videoGravityDisplayFill)) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (preview aspect-fill) already patched",
  );
} else {
  console.warn(
    "[patch-camera-preview-ios] skip preview aspect-fill: videoGravity assignment not found",
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

/**
 * Previously shipped “1080p+” patch that actually picked max pixels (4K) + HEVC.
 * Two variants: pristine v3 (zoom=1.0) and post-lens patch (defaultWideRawZoom).
 */
const QUALITY_V3_SETTINGS_AND_PICKERS = `    private enum SecondsAppCaptureSettings {
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
    }`;

const naturalPreviewQualityV3MaxPixelOldZoom1 = `extension CameraController {
${QUALITY_V3_SETTINGS_AND_PICKERS}

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

const naturalPreviewQualityV3MaxPixelOldWideZoom = `extension CameraController {
${QUALITY_V3_SETTINGS_AND_PICKERS}

    /// seconds-app: reset zoom and pick highest-resolution format (1080p+, then widest FOV).
    private func applyNaturalPreviewDeviceSettings(to device: AVCaptureDevice) throws {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        if let bestFormat = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = bestFormat
        }
        device.videoZoomFactor = defaultWideRawZoom(for: device)
        zoomFactor = device.videoZoomFactor
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }
    }

    func prepare(cameraPosition: String, disableAudio: Bool, completionHandler: @escaping (Error?) -> Void) {`;

/** v4/v5 block that preserves defaultWideRawZoom from the lens/focus patches. */
const QUALITY_CAPTURE_EXTENSION_WITH_WIDE_ZOOM = QUALITY_CAPTURE_EXTENSION.replace(
  `        device.videoZoomFactor = 1.0
        if let bestFormat = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = bestFormat
        }
        applyLocked30FpsFrameRate(to: device)
        ensureUltraWideZoomRange(on: device)
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }
        logActiveFrameRate(context: "after applyNaturalPreviewDeviceSettings", device: device)`,
  `        if let bestFormat = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = bestFormat
        }
        applyLocked30FpsFrameRate(to: device)
        ensureUltraWideZoomRange(on: device)
        device.videoZoomFactor = defaultWideRawZoom(for: device)
        zoomFactor = device.videoZoomFactor
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }
        logActiveFrameRate(context: "after applyNaturalPreviewDeviceSettings", device: device)`,
);

await patchFile(
  controllerPath,
  [
    [naturalPreviewQualityV3MaxPixelOldWideZoom, QUALITY_CAPTURE_EXTENSION_WITH_WIDE_ZOOM],
    [naturalPreviewQualityV3MaxPixelOldZoom1, QUALITY_CAPTURE_EXTENSION],
  ],
  "CameraController.swift (quality v3→v4: ~1080p cap + H.264 preferred)",
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

const handleTapGravityAnchorNew = `    /// seconds-app: always aspect-fill for circle-hole preview (letterbox must not show through scrim).
    func syncPreviewVideoGravity(forZoomFactor _factor: CGFloat) {
        guard let layer = self.previewLayer else { return }
        let gravity: AVLayerVideoGravity = .resizeAspectFill
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

const handlePinchGravityMid = `        switch pinch.state {
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

const handlePinchGravityNew = `        switch pinch.state {
        case .began:
            zoomFactor = device.videoZoomFactor
            fallthrough
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
  [
    [handlePinchGravityOld, handlePinchGravityNew],
    [handlePinchGravityMid, handlePinchGravityNew],
  ],
  "CameraController.swift (pinch sync preview gravity + began baseline)",
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

const duplicatePublicGravityDisplayZoomOld = `    /// seconds-app: aspect-fit at 1×; aspect-fill when zoomed so letterbox never shows through scrim holes.
    func syncPreviewVideoGravity(forZoomFactor factor: CGFloat) {
        guard let layer = self.previewLayer else { return }
        let displayZoom: CGFloat = {
            guard let device = self.activeCaptureDevice() else { return factor }
            return self.displayZoomFactor(fromRaw: factor, device: device)
        }()
        let gravity: AVLayerVideoGravity = displayZoom > 1.01 ? .resizeAspectFill : .resizeAspect
        if layer.videoGravity != gravity {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.videoGravity = gravity
            CATransaction.commit()
        }
    }

`;

const syncPreviewVideoGravityAlwaysFill = `    /// seconds-app: always aspect-fill for circle-hole preview (letterbox must not show through scrim).
    func syncPreviewVideoGravity(forZoomFactor _factor: CGFloat) {
        guard let layer = self.previewLayer else { return }
        let gravity: AVLayerVideoGravity = .resizeAspectFill
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
if (controllerDedup.includes(duplicatePublicGravityDisplayZoomOld)) {
  controllerDedup = controllerDedup.replace(
    duplicatePublicGravityDisplayZoomOld,
    syncPreviewVideoGravityAlwaysFill,
  );
  dedupChanged = true;
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (always aspect-fill gravity)",
  );
} else if (
  controllerDedup.includes(duplicatePublicGravityOld) &&
  !controllerDedup.includes("always aspect-fill for circle-hole")
) {
  controllerDedup = controllerDedup.replace(
    duplicatePublicGravityOld,
    syncPreviewVideoGravityAlwaysFill,
  );
  dedupChanged = true;
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (always aspect-fill gravity)",
  );
}
while (controllerDedup.split(syncPreviewVideoGravityAlwaysFill).length > 2) {
  const first = controllerDedup.indexOf(syncPreviewVideoGravityAlwaysFill);
  const second = controllerDedup.indexOf(
    syncPreviewVideoGravityAlwaysFill,
    first + syncPreviewVideoGravityAlwaysFill.length,
  );
  if (second < 0) break;
  controllerDedup =
    controllerDedup.slice(0, second) +
    controllerDedup.slice(second + syncPreviewVideoGravityAlwaysFill.length);
  dedupChanged = true;
  console.log(
    "[patch-camera-preview-ios] removed duplicate public syncPreviewVideoGravity",
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

// ── Phase A/B v5: lock 30fps CFR + recording AE/AF lock + suppress gestures ─

let controllerV5 = await readFile(controllerPath, "utf8");

if (!controllerV5.includes("suppressRecordingGestures")) {
  if (controllerV5.includes("private var _rotationCoordinator: Any?\n}")) {
    controllerV5 = controllerV5.replace(
      "private var _rotationCoordinator: Any?\n}",
      `private var _rotationCoordinator: Any?
    /// When true, ignore tap-focus during MovieFileOutput recording (AE/AF stay locked).
    /// Pinch / setZoom remain allowed — zoom is a brief load vs continuous AF hunting.
    private var suppressRecordingGestures = false
}`,
    );
    console.log(
      "[patch-camera-preview-ios] CameraController.swift (suppressRecordingGestures property)",
    );
  }
} else if (
  controllerV5.includes(
    "ignore tap-focus / pinch / setZoom (Phase B during MovieFileOutput recording)",
  )
) {
  controllerV5 = controllerV5.replace(
    "/// When true, ignore tap-focus / pinch / setZoom (Phase B during MovieFileOutput recording).\n    private var suppressRecordingGestures = false",
    `/// When true, ignore tap-focus during MovieFileOutput recording (AE/AF stay locked).
    /// Pinch / setZoom remain allowed — zoom is a brief load vs continuous AF hunting.
    private var suppressRecordingGestures = false`,
  );
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (suppressRecordingGestures comment: focus-only)",
  );
}

if (!controllerV5.includes("applyLocked30FpsFrameRate")) {
  const v4QualityStart = "extension CameraController {\n    private enum SecondsAppCaptureSettings {";
  const prepareAnchor = "\n    func prepare(cameraPosition: String, disableAudio: Bool, completionHandler: @escaping (Error?) -> Void) {";
  const startIdx = controllerV5.indexOf(v4QualityStart);
  const prepareIdx = controllerV5.indexOf(prepareAnchor, startIdx);
  if (startIdx >= 0 && prepareIdx > startIdx) {
    controllerV5 =
      controllerV5.slice(0, startIdx) +
      QUALITY_CAPTURE_EXTENSION_WITH_WIDE_ZOOM +
      controllerV5.slice(prepareIdx + prepareAnchor.length);
    // QUALITY_CAPTURE_EXTENSION_WITH_WIDE_ZOOM already ends with prepare(...) {
    // but we sliced after prepareAnchor which included the prepare signature — fix by
    // not double-including. WITH_WIDE_ZOOM ends with prepare signature, so slice should
    // start AFTER the prepare opening — we already consumed prepareAnchor from old file
    // and WITH_WIDE_ZOOM includes prepare opening. Good.
    console.log(
      "[patch-camera-preview-ios] CameraController.swift (quality v4→v5: 30fps lock + AE/AF helpers)",
    );
  } else {
    console.warn(
      "[patch-camera-preview-ios] skip v5 quality: SecondsAppCaptureSettings / prepare anchor not found",
    );
  }
}

const startRecordingV4Old = `        updateVideoOrientation()

        self.startRecordingCompletion = completion
        movieOutput.startRecording(to: fileUrl, recordingDelegate: self)`;

const startRecordingV5New = `        updateVideoOrientation()
        prepareDeviceForRecording()
        suppressRecordingGestures = true

        self.startRecordingCompletion = completion
        movieOutput.startRecording(to: fileUrl, recordingDelegate: self)`;

if (
  controllerV5.includes(startRecordingV4Old) &&
  !controllerV5.includes("suppressRecordingGestures = true")
) {
  controllerV5 = controllerV5.replace(startRecordingV4Old, startRecordingV5New);
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (startRecording prepareDeviceForRecording)",
  );
} else if (controllerV5.includes("suppressRecordingGestures = true")) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (startRecording prepareDeviceForRecording) already patched",
  );
} else {
  console.warn(
    "[patch-camera-preview-ios] skip startRecording v5: pattern not found",
  );
}

const finishRecordingV4Old = `    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let completion = stopRecordingCompletion {`;

const finishRecordingV5New = `    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        suppressRecordingGestures = false
        restoreContinuousFocusAndExposure()
        if let device = activeCaptureDevice() {
            logActiveFrameRate(context: "after stopRecording", device: device)
        }
        if let completion = stopRecordingCompletion {`;

if (
  controllerV5.includes(finishRecordingV4Old) &&
  !controllerV5.includes(
    "suppressRecordingGestures = false\n        restoreContinuousFocusAndExposure()",
  )
) {
  controllerV5 = controllerV5.replace(finishRecordingV4Old, finishRecordingV5New);
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (stopRecording restore continuous AE/AF)",
  );
} else if (
  controllerV5.includes(
    "suppressRecordingGestures = false\n        restoreContinuousFocusAndExposure()",
  )
) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (stopRecording restore continuous AE/AF) already patched",
  );
} else {
  console.warn(
    "[patch-camera-preview-ios] skip stopRecording v5: pattern not found",
  );
}

const handlePinchV4Old = `    @objc
    private func handlePinch(_ pinch: UIPinchGestureRecognizer) {
        guard let device = self.currentCameraPosition == .rear ? rearCamera : frontCamera else { return }`;

// v5 briefly blocked pinch while recording; v6 keeps pinch enabled (AE/AF lock is enough for fps).
if (
  controllerV5.includes(
    "guard !suppressRecordingGestures else { return }\n        guard let device = self.currentCameraPosition == .rear ? rearCamera : frontCamera else { return }",
  )
) {
  controllerV5 = controllerV5.replace(
    `    @objc
    private func handlePinch(_ pinch: UIPinchGestureRecognizer) {
        guard !suppressRecordingGestures else { return }
        guard let device = self.currentCameraPosition == .rear ? rearCamera : frontCamera else { return }`,
    handlePinchV4Old,
  );
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v6: pinch zoom allowed while recording)",
  );
} else if (controllerV5.includes(handlePinchV4Old)) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (pinch zoom while recording) already allowed",
  );
}

const setFocusV4Old = `  func setFocusAtNormalizedPoint(x: CGFloat, y: CGFloat, in previewView: UIView) {
    guard let device = activeCaptureDevice(), let previewLayer = previewLayer else { return }`;

const setFocusV5New = `  func setFocusAtNormalizedPoint(x: CGFloat, y: CGFloat, in previewView: UIView) {
    guard !suppressRecordingGestures else { return }
    guard let device = activeCaptureDevice(), let previewLayer = previewLayer else { return }`;

if (
  controllerV5.includes(setFocusV4Old) &&
  !controllerV5.includes(
    "func setFocusAtNormalizedPoint(x: CGFloat, y: CGFloat, in previewView: UIView) {\n    guard !suppressRecordingGestures else { return }",
  )
) {
  controllerV5 = controllerV5.replace(setFocusV4Old, setFocusV5New);
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (tap focus disabled while recording)",
  );
}

const setZoomBlockedWhileRecording = `  /// \`factor\` is display zoom (0.5× = ultra-wide, 1× = wide).
  func setZoomFactor(_ factor: CGFloat) throws {
    guard !suppressRecordingGestures else {
      throw CameraControllerError.invalidOperation
    }
    guard let device = activeCaptureDevice() else {
      throw CameraControllerError.captureSessionIsMissing
    }`;

const setZoomAllowedWhileRecording = `  /// \`factor\` is display zoom (0.5× = ultra-wide, 1× = wide).
  func setZoomFactor(_ factor: CGFloat) throws {
    guard let device = activeCaptureDevice() else {
      throw CameraControllerError.captureSessionIsMissing
    }`;

if (controllerV5.includes(setZoomBlockedWhileRecording)) {
  controllerV5 = controllerV5.replace(
    setZoomBlockedWhileRecording,
    setZoomAllowedWhileRecording,
  );
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v6: setZoom allowed while recording)",
  );
} else if (controllerV5.includes(setZoomAllowedWhileRecording)) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (setZoom while recording) already allowed",
  );
}

const diagNeedle =
  "        activeFormat: \\(dims.width)x\\(dims.height) FOV=\\(device.activeFormat.videoFieldOfView)\n      \"\"\"\n    )\n  }";
const diagReplacement =
  "        activeFormat: \\(dims.width)x\\(dims.height) FOV=\\(device.activeFormat.videoFieldOfView)\n        activeVideoMinFrameDuration fps: \\(String(format: \"%.2f\", frameRate(from: device.activeVideoMinFrameDuration)))\n        activeVideoMaxFrameDuration fps: \\(String(format: \"%.2f\", frameRate(from: device.activeVideoMaxFrameDuration)))\n      \"\"\"\n    )\n  }";

if (!controllerV5.includes("activeVideoMinFrameDuration fps:")) {
  if (controllerV5.includes(diagNeedle)) {
    controllerV5 = controllerV5.replace(diagNeedle, diagReplacement);
    console.log(
      "[patch-camera-preview-ios] CameraController.swift (diagnostics activeVideo frame duration)",
    );
  } else {
    console.warn(
      "[patch-camera-preview-ios] skip diagnostics fps: logRearCameraDiagnostics pattern not matched",
    );
  }
}

// ── Always-fill + ultra-wide pinch floor + ramp setZoom (circle-hole / 0.5×) ─

const ensureUltraWideHelper = `    /// Prefer a format that keeps ultra-wide (raw ≈ 1.0) reachable when hardware has it.
    private func ensureUltraWideZoomRange(on device: AVCaptureDevice) {
        guard device.constituentDevices.contains(where: { $0.deviceType == .builtInUltraWideCamera }),
              device.minAvailableVideoZoomFactor > 1.05 else { return }
        let locked = device.formats.filter { formatSupportsLocked30Fps($0) }
        let pool = locked.isEmpty ? device.formats : locked
        var restored = false
        for format in pool {
            device.activeFormat = format
            applyLocked30FpsFrameRate(to: device)
            if device.minAvailableVideoZoomFactor <= 1.05 {
                restored = true
                break
            }
        }
        if !restored, let fallback = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = fallback
            applyLocked30FpsFrameRate(to: device)
        }
    }

    /// seconds-app: reset zoom and pick ~1080p format (long side ≤ 1920), lock 30fps CFR.`;

if (
  !controllerV5.includes("func ensureUltraWideZoomRange(on") &&
  controllerV5.includes(
    "/// seconds-app: reset zoom and pick ~1080p format (long side ≤ 1920), lock 30fps CFR.",
  )
) {
  controllerV5 = controllerV5.replace(
    "    /// seconds-app: reset zoom and pick ~1080p format (long side ≤ 1920), lock 30fps CFR.",
    ensureUltraWideHelper,
  );
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (ensureUltraWideZoomRange helper)",
  );
}

const applyNaturalZoomWithoutEnsure = `        applyLocked30FpsFrameRate(to: device)
        device.videoZoomFactor = defaultWideRawZoom(for: device)
        zoomFactor = device.videoZoomFactor`;

const applyNaturalZoomWithEnsure = `        applyLocked30FpsFrameRate(to: device)
        ensureUltraWideZoomRange(on: device)
        device.videoZoomFactor = defaultWideRawZoom(for: device)
        zoomFactor = device.videoZoomFactor`;

if (
  controllerV5.includes(applyNaturalZoomWithoutEnsure) &&
  !controllerV5.includes("ensureUltraWideZoomRange(on: device)")
) {
  controllerV5 = controllerV5.replace(
    applyNaturalZoomWithoutEnsure,
    applyNaturalZoomWithEnsure,
  );
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (ensure ultra-wide zoom range on start)",
  );
}

const setZoomDirectAssign = `    let raw = clampRawZoom(rawZoomFactor(fromDisplay: factor, device: device), device: device)

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    device.videoZoomFactor = raw
    zoomFactor = raw

    DispatchQueue.main.async {
      self.syncPreviewVideoGravity(forZoomFactor: raw)
    }
  }`;

const setZoomRampAssign = `    let raw = clampRawZoom(rawZoomFactor(fromDisplay: factor, device: device), device: device)

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    // Ramp across optical switch-over points; pinch uses direct assignment.
    if abs(device.videoZoomFactor - raw) > 0.08 {
      device.ramp(toVideoZoomFactor: raw, withRate: 8)
    } else {
      device.videoZoomFactor = raw
    }
    zoomFactor = raw

    DispatchQueue.main.async {
      self.syncPreviewVideoGravity(forZoomFactor: raw)
    }
  }`;

if (
  controllerV5.includes(setZoomDirectAssign) &&
  !controllerV5.includes("ramp(toVideoZoomFactor:")
) {
  controllerV5 = controllerV5.replace(setZoomDirectAssign, setZoomRampAssign);
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (ramp setZoom across lens hops)",
  );
} else if (controllerV5.includes("ramp(toVideoZoomFactor:")) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (ramp setZoom) already patched",
  );
}

if (controllerV5.includes("withRate: 8.0)")) {
  controllerV5 = controllerV5.replaceAll("withRate: 8.0)", "withRate: 8)");
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (withRate Float literal fix)",
  );
}

if (
  controllerV5.includes("func syncPreviewVideoGravity") &&
  !controllerV5.includes("always aspect-fill for circle-hole")
) {
  const gravityFnStart = controllerV5.indexOf(
    "    func syncPreviewVideoGravity(forZoomFactor",
  );
  if (gravityFnStart >= 0) {
    const braceOpen = controllerV5.indexOf("{", gravityFnStart);
    let depth = 0;
    let i = braceOpen;
    for (; i < controllerV5.length; i++) {
      const ch = controllerV5[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    // Include leading doc comment if present.
    let commentStart = gravityFnStart;
    const maybeComment = controllerV5.lastIndexOf("    /// seconds-app:", gravityFnStart);
    if (maybeComment >= 0 && gravityFnStart - maybeComment < 200) {
      commentStart = maybeComment;
    }
    controllerV5 =
      controllerV5.slice(0, commentStart) +
      syncPreviewVideoGravityAlwaysFill.trimEnd() +
      "\n\n" +
      controllerV5.slice(i);
    console.log(
      "[patch-camera-preview-ios] CameraController.swift (force always aspect-fill gravity)",
    );
  }
}

await writeFile(controllerPath, controllerV5, "utf8");

// =============================================================================
// v7: Prevent V<<A recordings — lock multi-cam switching + pause VideoDataOutput
// while MovieFileOutput is writing. Pinch zoom across dual/triple switch-over
// points can interrupt the video track while mic audio continues.
// =============================================================================

let controllerV7 = await readFile(controllerPath, "utf8");

const lockHelpersOld = `    private func configureMovieFileOutput(_ movieOutput: AVCaptureMovieFileOutput) {
        guard let connection = movieOutput.connection(with: .video) else { return }`;

const lockHelpersNew = `    /// Lock virtual multi-cam constituent switching for the duration of a take.
    /// Without this, pinch zoom across switch-over factors can change the active
    /// physical camera mid-recording and stall/end the video track while audio continues.
    private func lockConstituentSwitchingForRecording(on movieOutput: AVCaptureMovieFileOutput) {
        guard #available(iOS 15.0, *) else { return }
        // Default recording behavior is .restricted (switch-overs still allowed under
        // some conditions). Lock to the active physical camera for the whole take so
        // pinch zoom cannot interrupt the video track while mic audio continues.
        movieOutput.isPrimaryConstituentDeviceSwitchingBehaviorForRecordingEnabled = true
        movieOutput.setPrimaryConstituentDeviceSwitchingBehaviorForRecording(
            .locked,
            restrictedSwitchingBehaviorConditions: []
        )
        print("[seconds-app-camera] locked constituent switching for recording")
    }

    /// VideoDataOutput competes with MovieFileOutput for the video pipeline.
    /// Disable its connections for the duration of a take (re-enable afterwards).
    private func setVideoDataOutputEnabled(_ enabled: Bool) {
        guard let dataOutput = self.dataOutput else { return }
        for connection in dataOutput.connections {
            connection.isEnabled = enabled
        }
        print("[seconds-app-camera] videoDataOutput connections enabled=\\(enabled)")
    }

    private func configureMovieFileOutput(_ movieOutput: AVCaptureMovieFileOutput) {
        guard let connection = movieOutput.connection(with: .video) else { return }`;

if (
  !controllerV7.includes("lockConstituentSwitchingForRecording") &&
  controllerV7.includes(lockHelpersOld)
) {
  controllerV7 = controllerV7.replace(lockHelpersOld, lockHelpersNew);
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v7: lock multi-cam + dataOutput helpers)",
  );
} else if (controllerV7.includes("lockConstituentSwitchingForRecording")) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v7 helpers) already patched",
  );
} else {
  console.warn(
    "[patch-camera-preview-ios] skip v7 helpers: configureMovieFileOutput anchor not found",
  );
}

const startRecV6 = `        updateVideoOrientation()
        prepareDeviceForRecording()
        suppressRecordingGestures = true

        self.startRecordingCompletion = completion
        movieOutput.startRecording(to: fileUrl, recordingDelegate: self)`;

const startRecV7 = `        updateVideoOrientation()
        prepareDeviceForRecording()
        suppressRecordingGestures = true
        lockConstituentSwitchingForRecording(on: movieOutput)
        setVideoDataOutputEnabled(false)

        self.startRecordingCompletion = completion
        movieOutput.startRecording(to: fileUrl, recordingDelegate: self)`;

if (
  controllerV7.includes(startRecV6) &&
  !controllerV7.includes("lockConstituentSwitchingForRecording(on: movieOutput)")
) {
  controllerV7 = controllerV7.replace(startRecV6, startRecV7);
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v7: startRecording lock + pause dataOutput)",
  );
} else if (controllerV7.includes("lockConstituentSwitchingForRecording(on: movieOutput)")) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v7 startRecording) already patched",
  );
} else {
  console.warn(
    "[patch-camera-preview-ios] skip v7 startRecording: pattern not found",
  );
}

const finishRecV6 = `        suppressRecordingGestures = false
        restoreContinuousFocusAndExposure()
        if let device = activeCaptureDevice() {
            logActiveFrameRate(context: "after stopRecording", device: device)
        }`;

const finishRecV7 = `        suppressRecordingGestures = false
        setVideoDataOutputEnabled(true)
        restoreContinuousFocusAndExposure()
        if let device = activeCaptureDevice() {
            logActiveFrameRate(context: "after stopRecording", device: device)
        }`;

if (
  controllerV7.includes(finishRecV6) &&
  !controllerV7.includes(
    "setVideoDataOutputEnabled(true)\n        restoreContinuousFocusAndExposure()",
  )
) {
  controllerV7 = controllerV7.replace(finishRecV6, finishRecV7);
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v7: stopRecording re-enable dataOutput)",
  );
} else if (
  controllerV7.includes(
    "setVideoDataOutputEnabled(true)\n        restoreContinuousFocusAndExposure()",
  )
) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v7 stopRecording) already patched",
  );
} else {
  console.warn(
    "[patch-camera-preview-ios] skip v7 stopRecording: pattern not found",
  );
}

// Log pinch zoom while recording (evidence for next kai-class failure).
const pinchBeganOld = `        case .began:
            zoomFactor = device.videoZoomFactor
            fallthrough
        case .changed:`;

const pinchBeganNew = `        case .began:
            zoomFactor = device.videoZoomFactor
            if suppressRecordingGestures {
                print("[seconds-app-camera] pinch began during recording rawZoom=\\(device.videoZoomFactor)")
            }
            fallthrough
        case .changed:`;

if (
  controllerV7.includes(pinchBeganOld) &&
  !controllerV7.includes("pinch began during recording")
) {
  controllerV7 = controllerV7.replace(pinchBeganOld, pinchBeganNew);
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v7: log pinch during recording)",
  );
} else if (controllerV7.includes("pinch began during recording")) {
  console.log(
    "[patch-camera-preview-ios] CameraController.swift (v7 pinch log) already patched",
  );
}

await writeFile(controllerPath, controllerV7, "utf8");

