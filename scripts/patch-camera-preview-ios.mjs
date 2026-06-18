/**
 * Patches @capacitor-community/camera-preview iOS:
 * 1. Implements AVCaptureMovieFileOutput video recording (stock v8 stubs hang forever)
 * 2. startRecordVideo resolves when recording starts; stopRecordVideo returns videoFilePath
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

const updateOrientationOld = `        previewLayer?.connection?.videoOrientation = videoOrientation
        dataOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
        photoOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
    }`;

const updateOrientationNew = `        previewLayer?.connection?.videoOrientation = videoOrientation
        dataOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
        photoOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
        movieFileOutput?.connections.forEach { $0.videoOrientation = videoOrientation }
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
        if let connection = movieOutput.connection(with: .video) {
            connection.videoOrientation = previewLayer?.connection?.videoOrientation ?? .portrait
        }

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
                call.resolve(["videoFilePath": url.path])
            }
        }
    }`;

async function patchFile(path, replacements, label) {
  let content = await readFile(path, "utf8");
  let changed = false;

  for (const [oldText, newText] of replacements) {
    if (content.includes(newText)) continue;
    if (!content.includes(oldText)) {
      console.warn(`[patch-camera-preview-ios] skip ${label}: pattern not found`);
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
}

await patchFile(
  controllerPath,
  [
    [controllerPropertiesOld, controllerPropertiesNew],
    [configurePhotoOld, configurePhotoNew],
    [updateOrientationOld, updateOrientationNew],
    [captureVideoOld, captureVideoNew],
    [fileOutputDelegateOld, fileOutputDelegateNew],
  ],
  "CameraController.swift",
);

await patchFile(
  pluginPath,
  [[pluginStartRecordOld, pluginStartRecordNew]],
  "CameraPreviewPlugin.swift",
);
