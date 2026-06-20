import type { ReactNode } from "react";

export function FeedDiagShell({
  stage,
  title,
  children,
}: {
  stage: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      className="app-page flex min-h-[100dvh] flex-col px-6 py-8"
      style={{ fontFamily: "system-ui, sans-serif", color: "#eee", background: "#111" }}
    >
      <h1 className="text-lg font-bold">STAGE {stage}</h1>
      <p className="mt-1 text-sm text-violet-300">{title}</p>
      <div className="mt-6 space-y-2 text-sm">{children}</div>
    </main>
  );
}
