/**
 * Phase 2 (tap focus) + Phase 3 (lens zoom) Swift patches for camera-preview iOS.
 * Imported by patch-camera-preview-ios.mjs
 */

export const FOCUS_LENS_CONTROLLER_PATCHES = [
  [
    `    func setupGestures(target: UIView, enableZoom: Bool) {
        setupTapGesture(target: target, selector: #selector(handleTap(_:)), delegate: self)
        if enableZoom {
            setupPinchGesture(target: target, selector: #selector(handlePinch(_:)), delegate: self)
        }
    }`,
    `    func setupGestures(target: UIView, enableZoom: Bool) {
        // Tap focus is driven from Web via setFocusPoint (normalized coords).
        if enableZoom {
            setupPinchGesture(target: target, selector: #selector(handlePinch(_:)), delegate: self)
        }
    }`,
  ],
  [
    `            self.rearCamera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
                ?? discovered.first(where: { $0.position == .back })`,
    `            self.rearCamera = self.selectRearCameraDevice()
                ?? discovered.first(where: { $0.position == .back })`,
  ],
  [
    `        func minMaxZoom(_ factor: CGFloat) -> CGFloat { return max(1.0, min(factor, device.activeFormat.videoMaxZoomFactor)) }`,
    `        func minMaxZoom(_ factor: CGFloat) -> CGFloat {
            let minZ = device.minAvailableVideoZoomFactor
            let maxZ = min(device.activeFormat.videoMaxZoomFactor, device.maxAvailableVideoZoomFactor)
            return max(minZ, min(factor, maxZ))
        }`,
  ],
];

export const FOCUS_LENS_CONTROLLER_EXTENSION = `

extension CameraController {
  private func selectRearCameraDevice() -> AVCaptureDevice? {
    let preferredTypes: [AVCaptureDevice.DeviceType] = [
      .builtInTripleCamera,
      .builtInDualWideCamera,
      .builtInDualCamera,
      .builtInWideAngleCamera,
    ]
    for deviceType in preferredTypes {
      if let device = AVCaptureDevice.default(deviceType, for: .video, position: .back) {
        return device
      }
    }
    return nil
  }

  func setFocusAtNormalizedPoint(x: CGFloat, y: CGFloat, in previewView: UIView) {
    guard let device = activeCaptureDevice(), let previewLayer = previewLayer else { return }

    let nx = min(1, max(0, x))
    let ny = min(1, max(0, y))
    let layerPoint = CGPoint(x: nx * previewView.bounds.width, y: ny * previewView.bounds.height)
    let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: layerPoint)

    do {
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      if device.isFocusPointOfInterestSupported {
        device.focusPointOfInterest = devicePoint
        if device.isFocusModeSupported(.autoFocus) {
          device.focusMode = .autoFocus
        }
      }

      if device.isExposurePointOfInterestSupported {
        device.exposurePointOfInterest = devicePoint
        if device.isExposureModeSupported(.autoExpose) {
          device.exposureMode = .autoExpose
        }
      }
    } catch {
      debugPrint(error)
      return
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
      guard let self = self, let current = self.activeCaptureDevice(), current.uniqueID == device.uniqueID else {
        return
      }
      do {
        try current.lockForConfiguration()
        defer { current.unlockForConfiguration() }
        if current.isFocusModeSupported(.continuousAutoFocus) {
          current.focusMode = .continuousAutoFocus
        }
        if current.isExposureModeSupported(.continuousAutoExposure) {
          current.exposureMode = .continuousAutoExposure
        }
      } catch {
        debugPrint(error)
      }
    }
  }

  func getAvailableLenses() -> [[String: Any]] {
    guard currentCameraPosition == .rear, let device = activeCaptureDevice() else {
      return [["id": "1", "label": "1×", "factor": 1.0]]
    }

    let minZ = device.minAvailableVideoZoomFactor
    let maxZ = min(device.activeFormat.videoMaxZoomFactor, device.maxAvailableVideoZoomFactor)
    var factors: [CGFloat] = []

    func appendFactor(_ value: CGFloat) {
      guard value >= minZ - 0.05, value <= maxZ + 0.05 else { return }
      if factors.contains(where: { abs($0 - value) < 0.08 }) { return }
      factors.append(value)
    }

    for candidate in [0.5, 1.0, 2.0] {
      appendFactor(candidate)
    }

    for factor in device.virtualDeviceSwitchOverVideoZoomFactors {
      appendFactor(CGFloat(truncating: factor))
    }

    factors.sort()
    if factors.isEmpty {
      appendFactor(max(1.0, minZ))
    }

    return factors.map { factor in
      let label: String
      if factor < 0.75 {
        label = "0.5×"
      } else if factor < 1.5 {
        label = "1×"
      } else {
        label = "2×"
      }
      return [
        "id": String(format: "%.2f", factor),
        "label": label,
        "factor": Double(factor),
      ]
    }
  }

  func setZoomFactor(_ factor: CGFloat) throws {
    guard let device = activeCaptureDevice() else {
      throw CameraControllerError.captureSessionIsMissing
    }

    let minZ = device.minAvailableVideoZoomFactor
    let maxZ = min(device.activeFormat.videoMaxZoomFactor, device.maxAvailableVideoZoomFactor)
    let clamped = max(minZ, min(factor, maxZ))

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    device.videoZoomFactor = clamped
    zoomFactor = clamped

    DispatchQueue.main.async {
      self.syncPreviewVideoGravity(forZoomFactor: clamped)
    }
  }

  func currentZoomFactor() -> Double {
    guard let device = activeCaptureDevice() else { return 1.0 }
    return Double(device.videoZoomFactor)
  }
}
`;

export const FOCUS_LENS_PLUGIN_METHODS_OLD = `        CAPPluginMethod(name: "isCameraStarted", returnType: CAPPluginReturnPromise)
    ]`;

export const FOCUS_LENS_PLUGIN_METHODS_NEW = `        CAPPluginMethod(name: "isCameraStarted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFocusPoint", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAvailableLenses", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setZoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getZoom", returnType: CAPPluginReturnPromise)
    ]`;

export const FOCUS_LENS_PLUGIN_HANDLERS = `
    @objc func setFocusPoint(_ call: CAPPluginCall) {
        guard let x = call.getDouble("x"), let y = call.getDouble("y") else {
            call.reject("x and y are required")
            return
        }

        DispatchQueue.main.async {
            guard let previewView = self.previewView else {
                call.reject("preview not started")
                return
            }
            self.cameraController.setFocusAtNormalizedPoint(
                x: CGFloat(x),
                y: CGFloat(y),
                in: previewView
            )
            call.resolve()
        }
    }

    @objc func getAvailableLenses(_ call: CAPPluginCall) {
        let lenses = self.cameraController.getAvailableLenses()
        call.resolve(["lenses": lenses])
    }

    @objc func setZoom(_ call: CAPPluginCall) {
        guard let factor = call.getDouble("factor") else {
            call.reject("factor is required")
            return
        }

        do {
            try self.cameraController.setZoomFactor(CGFloat(factor))
            call.resolve(["factor": self.cameraController.currentZoomFactor()])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func getZoom(_ call: CAPPluginCall) {
        call.resolve(["factor": self.cameraController.currentZoomFactor()])
    }
`;

export const FOCUS_LENS_PLUGIN_INSERT_BEFORE = `    @objc func isCameraStarted(_ call: CAPPluginCall) {`;
