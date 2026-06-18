export function debounceAsync(
  fn: () => Promise<void>,
  waitMs: number,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;

  const run = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await fn();
    } catch (err) {
      console.warn("[debounceAsync] operation failed", err);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        void run();
      }
    }
  };

  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, waitMs);
  };
}
