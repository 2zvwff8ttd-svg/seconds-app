/**
 * Patches @capacitor-community/camera-preview Android recording so failures
 * (e.g. emulator setAudioSource) reject the Capacitor promise instead of crashing.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const pluginRoot = resolve(
  process.cwd(),
  "node_modules/@capacitor-community/camera-preview/android/src/main/java/com/ahm/capacitor/camera/preview",
);

const activityPath = resolve(pluginRoot, "CameraActivity.java");
const previewPath = resolve(pluginRoot, "CameraPreview.java");

const activityCatchOld = `        } catch (IOException e) {
            eventListener.onStartRecordVideoError(e.getMessage());
        }`;

const activityCatchNew = `        } catch (Exception e) {
            Log.e(TAG, "startRecord failed", e);
            String message = e.getMessage();
            eventListener.onStartRecordVideoError(
                message != null && message.trim().length() > 0 ? message : "Recording failed",
            );
        }`;

const previewStartOld = `        call.resolve();
    }

    @PluginMethod
    public void stopRecordVideo(PluginCall call) {`;

const previewStartNew = `    }

    @PluginMethod
    public void stopRecordVideo(PluginCall call) {`;

const previewOnStartOld = `    @Override
    public void onStartRecordVideo() {}

    @Override
    public void onStartRecordVideoError(String message) {
        bridge.getSavedCall(recordCallbackId).reject(message);
    }`;

const previewOnStartNew = `    @Override
    public void onStartRecordVideo() {
        PluginCall pluginCall = bridge.getSavedCall(recordCallbackId);
        if (pluginCall != null) {
            pluginCall.resolve();
            bridge.releaseCall(pluginCall);
        }
    }

    @Override
    public void onStartRecordVideoError(String message) {
        PluginCall pluginCall = bridge.getSavedCall(recordCallbackId);
        if (pluginCall != null) {
            pluginCall.reject(message);
            bridge.releaseCall(pluginCall);
        }
    }`;

async function patchFile(path, replacements, label) {
  let content = await readFile(path, "utf8");
  let changed = false;

  for (const [oldText, newText] of replacements) {
    if (content.includes(newText)) continue;
    if (!content.includes(oldText)) {
      console.warn(`[patch-camera-preview-android] skip ${label}: pattern not found`);
      continue;
    }
    content = content.replace(oldText, newText);
    changed = true;
  }

  if (changed) {
    await writeFile(path, content, "utf8");
    console.log(`[patch-camera-preview-android] patched ${label}`);
  } else {
    console.log(`[patch-camera-preview-android] ${label} already patched`);
  }
}

await patchFile(
  activityPath,
  [[activityCatchOld, activityCatchNew]],
  "CameraActivity.java",
);
await patchFile(
  previewPath,
  [
    [previewStartOld, previewStartNew],
    [previewOnStartOld, previewOnStartNew],
  ],
  "CameraPreview.java",
);
