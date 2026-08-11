/**
 * Force DOM layers transparent so native toBack camera can show through WKWebView.
 * CSS alone loses to Tailwind bg-black / color-scheme sometimes after layout paints.
 */
const STYLED_ATTR = "data-record-preview-transparent";

export function applyRecordPreviewTransparentSurfaces(): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  html.classList.add("record-native-preview-active");
  body.classList.add("record-native-preview-active");

  const targets: HTMLElement[] = [html, body];
  document
    .querySelectorAll<HTMLElement>(
      ".app-page, .post-page-root, .post-form-scroll, .record-camera-root",
    )
    .forEach((el) => targets.push(el));

  for (const el of targets) {
    el.style.setProperty("background", "transparent", "important");
    el.style.setProperty("background-color", "transparent", "important");
    el.setAttribute(STYLED_ATTR, "1");
  }
}

export function clearRecordPreviewTransparentSurfaces(): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  html.classList.remove("record-native-preview-active");
  body.classList.remove("record-native-preview-active");

  document
    .querySelectorAll<HTMLElement>(`[${STYLED_ATTR}]`)
    .forEach((el) => {
      el.style.removeProperty("background");
      el.style.removeProperty("background-color");
      el.removeAttribute(STYLED_ATTR);
    });
}

export function readPreviewSurfaceDiag(): {
  htmlHasClass: boolean;
  bodyHasClass: boolean;
  bodyBg: string;
  htmlBg: string;
} {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return {
      htmlHasClass: false,
      bodyHasClass: false,
      bodyBg: "n/a",
      htmlBg: "n/a",
    };
  }
  const html = document.documentElement;
  const body = document.body;
  const bodyStyle = window.getComputedStyle(body);
  const htmlStyle = window.getComputedStyle(html);
  return {
    htmlHasClass: html.classList.contains("record-native-preview-active"),
    bodyHasClass: body.classList.contains("record-native-preview-active"),
    bodyBg: bodyStyle.backgroundColor,
    htmlBg: htmlStyle.backgroundColor,
  };
}
