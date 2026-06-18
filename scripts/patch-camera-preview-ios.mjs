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

extension CameraController {
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

const createCaptureSessionOld = `        func createCaptureSession() {
            self.captureSession = AVCaptureSession()
        }`;

const createCaptureSessionNew = `        func createCaptureSession() {
            self.captureSession = AVCaptureSession()
            self.captureSession?.sessionPreset = .high
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
        self.previewLayer?.frame = view.bounds
        self.previewLayer?.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]`;

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

const displayPreviewFrameWrongMaskOld = `        self.previewLayer?.autoresizingMask = [.flexibleWidth, .flexibleHeight]`;
const displayPreviewFrameWrongMaskNew = `        self.previewLayer?.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]`;

await patchFile(
  controllerPath,
  [
    [naturalPreviewHelperOld, naturalPreviewHelperNew],
    [createCaptureSessionOld, createCaptureSessionNew],
    [configureCaptureDevicesOld, configureCaptureDevicesNew],
    [displayPreviewFrameOld, displayPreviewFrameNew],
    [displayPreviewFrameWrongMaskOld, displayPreviewFrameWrongMaskNew],
    [switchCamerasCommitOld, switchCamerasCommitNew],
  ],
  "CameraController.swift (natural preview FOV)",
);
