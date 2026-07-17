/**
 * Phase 2 (tap focus) + Phase 3 (lens zoom) Swift patches for camera-preview iOS.
 * Imported by patch-camera-preview-ios.mjs
 *
 * Zoom model (virtual rear camera with ultra-wide):
 *   raw videoZoomFactor 1.0  ≈ display 0.5× (ultra-wide)
 *   raw wideBase (switchOver) ≈ display 1.0× (wide)
 *   display = raw / wideBase
 */

/** Previous extension body — replaced on upgrade by patch-camera-preview-ios.mjs */
export const FOCUS_LENS_CONTROLLER_EXTENSION_V1 = `

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
            let clamped = max(minZ, min(factor, maxZ))
            // Snap near the floor so pinch reliably reaches ultra-wide (display 0.5×).
            if clamped <= minZ + 0.05 { return minZ }
            return clamped
        }`,
  ],
  [
    `        func minMaxZoom(_ factor: CGFloat) -> CGFloat {
            let minZ = device.minAvailableVideoZoomFactor
            let maxZ = min(device.activeFormat.videoMaxZoomFactor, device.maxAvailableVideoZoomFactor)
            return max(minZ, min(factor, maxZ))
        }`,
    `        func minMaxZoom(_ factor: CGFloat) -> CGFloat {
            let minZ = device.minAvailableVideoZoomFactor
            let maxZ = min(device.activeFormat.videoMaxZoomFactor, device.maxAvailableVideoZoomFactor)
            let clamped = max(minZ, min(factor, maxZ))
            // Snap near the floor so pinch reliably reaches ultra-wide (display 0.5×).
            if clamped <= minZ + 0.05 { return minZ }
            return clamped
        }`,
  ],
  [
    `        device.videoZoomFactor = 1.0
        if let bestFormat = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = bestFormat
        }`,
    `        if let bestFormat = pickBestCaptureFormat(from: device.formats) {
            device.activeFormat = bestFormat
        }
        device.videoZoomFactor = defaultWideRawZoom(for: device)
        zoomFactor = device.videoZoomFactor`,
  ],
  [
    `            captureSession.startRunning()
        }`,
    `            captureSession.startRunning()
            self.logRearCameraDiagnostics(context: "after startRunning")
        }`,
  ],
  [
    `        let gravity: AVLayerVideoGravity = factor > 1.01 ? .resizeAspectFill : .resizeAspect`,
    `        let gravity: AVLayerVideoGravity = .resizeAspectFill`,
  ],
  [
    `        let displayZoom: CGFloat = {
            guard let device = self.activeCaptureDevice() else { return factor }
            return self.displayZoomFactor(fromRaw: factor, device: device)
        }()
        let gravity: AVLayerVideoGravity = displayZoom > 1.01 ? .resizeAspectFill : .resizeAspect`,
    `        let gravity: AVLayerVideoGravity = .resizeAspectFill`,
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

  fileprivate func hasUltraWideConstituent(_ device: AVCaptureDevice) -> Bool {
    device.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }
  }

  /// Raw zoom that maps to display 1× (wide). On dual-/triple-camera this is switchOver[0].
  fileprivate func wideBaseRawZoom(for device: AVCaptureDevice) -> CGFloat {
    guard hasUltraWideConstituent(device) else { return 1.0 }
    if let first = device.virtualDeviceSwitchOverVideoZoomFactors.first {
      return CGFloat(truncating: first)
    }
    return 2.0
  }

  fileprivate func defaultWideRawZoom(for device: AVCaptureDevice) -> CGFloat {
    wideBaseRawZoom(for: device)
  }

  fileprivate func displayZoomFactor(fromRaw raw: CGFloat, device: AVCaptureDevice) -> CGFloat {
    let base = wideBaseRawZoom(for: device)
    guard base > 0.001 else { return raw }
    return raw / base
  }

  fileprivate func rawZoomFactor(fromDisplay display: CGFloat, device: AVCaptureDevice) -> CGFloat {
    display * wideBaseRawZoom(for: device)
  }

  fileprivate func clampRawZoom(_ raw: CGFloat, device: AVCaptureDevice) -> CGFloat {
    let minZ = device.minAvailableVideoZoomFactor
    let maxZ = min(device.activeFormat.videoMaxZoomFactor, device.maxAvailableVideoZoomFactor)
    return max(minZ, min(raw, maxZ))
  }

  fileprivate func lensLabel(forDisplay display: CGFloat) -> String {
    if display < 0.75 {
      return "0.5×"
    }
    if display < 1.5 {
      return "1×"
    }
    if display < 2.5 {
      return "2×"
    }
    return String(format: "%.1f×", display)
  }

  /// Diagnostic log for D decision (wide-only degeneration). Search Xcode/Codemagic logs for [seconds-app-camera].
  func logRearCameraDiagnostics(context: String) {
    guard let device = rearCamera else {
      print("[seconds-app-camera] \\(context): rearCamera=nil")
      return
    }
    let dims = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
    let constituents = device.constituentDevices
      .map { $0.deviceType.rawValue }
      .joined(separator: ", ")
    let switchOvers = device.virtualDeviceSwitchOverVideoZoomFactors
      .map { String(format: "%.2f", CGFloat(truncating: $0)) }
      .joined(separator: ", ")
    let wideBase = wideBaseRawZoom(for: device)
    let display = displayZoomFactor(fromRaw: device.videoZoomFactor, device: device)
    print(
      """
      [seconds-app-camera] \\(context)
        deviceType: \\(device.deviceType.rawValue)
        constituentDevices: [\\(constituents)]
        hasUltraWide: \\(hasUltraWideConstituent(device))
        minAvailableVideoZoomFactor: \\(device.minAvailableVideoZoomFactor)
        maxAvailableVideoZoomFactor: \\(device.maxAvailableVideoZoomFactor)
        videoMaxZoomFactor(activeFormat): \\(device.activeFormat.videoMaxZoomFactor)
        virtualDeviceSwitchOverVideoZoomFactors: [\\(switchOvers)]
        wideBaseRawZoom_display1x: \\(wideBase)
        currentVideoZoomFactor_raw: \\(device.videoZoomFactor)
        currentDisplayZoom: \\(String(format: "%.2f", display))x
        activeFormat: \\(dims.width)x\\(dims.height) FOV=\\(device.activeFormat.videoFieldOfView)
        activeVideoMinFrameDuration fps: \\(String(format: "%.2f", frameRate(from: device.activeVideoMinFrameDuration)))
        activeVideoMaxFrameDuration fps: \\(String(format: "%.2f", frameRate(from: device.activeVideoMaxFrameDuration)))
      """
    )
  }

  func setFocusAtNormalizedPoint(x: CGFloat, y: CGFloat, in previewView: UIView) {
    guard !suppressRecordingGestures else { return }
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

    let minRaw = device.minAvailableVideoZoomFactor
    let maxRaw = min(device.activeFormat.videoMaxZoomFactor, device.maxAvailableVideoZoomFactor)
    var displayFactors: [CGFloat] = []

    func appendDisplay(_ display: CGFloat) {
      let raw = rawZoomFactor(fromDisplay: display, device: device)
      guard raw >= minRaw - 0.05, raw <= maxRaw + 0.05 else { return }
      if displayFactors.contains(where: { abs($0 - display) < 0.08 }) { return }
      displayFactors.append(display)
    }

    if hasUltraWideConstituent(device) {
      appendDisplay(0.5)
    }
    appendDisplay(1.0)

    for factor in device.virtualDeviceSwitchOverVideoZoomFactors {
      let raw = CGFloat(truncating: factor)
      appendDisplay(raw / wideBaseRawZoom(for: device))
    }

    for candidate in [2.0, 3.0] {
      appendDisplay(candidate)
    }

    displayFactors.sort()
    if displayFactors.isEmpty {
      appendDisplay(1.0)
    }

    return displayFactors.map { display in
      [
        "id": String(format: "%.2f", display),
        "label": lensLabel(forDisplay: display),
        "factor": Double(display),
      ]
    }
  }

  /// \`factor\` is display zoom (0.5× = ultra-wide, 1× = wide).
  /// Allowed during recording — AE/AF stay locked; pinch zoom is a brief load.
  func setZoomFactor(_ factor: CGFloat) throws {
    guard let device = activeCaptureDevice() else {
      throw CameraControllerError.captureSessionIsMissing
    }

    let raw = clampRawZoom(rawZoomFactor(fromDisplay: factor, device: device), device: device)

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
  }

  func currentZoomFactor() -> Double {
    guard let device = activeCaptureDevice() else { return 1.0 }
    return Double(displayZoomFactor(fromRaw: device.videoZoomFactor, device: device))
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
