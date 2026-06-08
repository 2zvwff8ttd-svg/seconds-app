import { AppFooter } from "@/components/layout/AppFooter";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import Link from "next/link";

export function SettingsScreen() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            法的文書
          </h2>
          <ul className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface-elevated">
            {LEGAL_DOCUMENTS.map((doc, index) => (
              <li key={doc.id}>
                <Link
                  href={doc.href}
                  className={`flex items-center justify-between px-4 py-3.5 text-sm text-foreground transition hover:bg-white/5 ${
                    index > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <span>{doc.title}</span>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            アプリについて
          </h2>
          <div className="mt-3 rounded-2xl border border-border bg-surface-elevated px-4 py-3.5 text-sm text-muted">
            <p>?Seconds — 短尺 vlog SNS</p>
            <p className="mt-1 text-xs">バージョン 0.1.0</p>
          </div>
        </section>
      </div>

      <AppFooter />
    </div>
  );
}
