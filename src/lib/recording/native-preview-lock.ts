/** ネイティブ camera-preview の start/stop を直列化（並行呼び出しで iOS が落ちるのを防ぐ） */
let operationChain: Promise<void> = Promise.resolve();

export function enqueueNativePreviewOp<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const run = operationChain.then(
    () => fn(),
    () => fn(),
  );
  operationChain = run.then(
    () => {},
    (err) => {
      console.warn(`[native-preview-lock] ${label} failed`, err);
    },
  );
  return run;
}

export function resetNativePreviewLock(): void {
  operationChain = Promise.resolve();
}
