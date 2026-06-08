import { AppFooter } from "@/components/layout/AppFooter";
import { LegalBackButton } from "@/components/legal/LegalBackButton";

type LegalPageShellProps = {
  title: string;
  children: React.ReactNode;
};

export function LegalPageShell({ title, children }: LegalPageShellProps) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-black">
      <header className="z-header shrink-0 border-b border-border px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <LegalBackButton />
          <h1 className="text-base font-semibold text-foreground sm:text-lg">
            {title}
          </h1>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-5">
        {children}
      </main>

      <AppFooter />
    </div>
  );
}
