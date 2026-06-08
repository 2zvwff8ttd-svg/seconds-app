import { LegalLinks } from "@/components/layout/LegalLinks";

export function AppFooter() {
  return (
    <footer className="shrink-0 border-t border-border px-4 py-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <LegalLinks />
      <p className="mt-4 text-center text-[10px] text-muted/80">
        © {new Date().getFullYear()} ?Seconds
      </p>
    </footer>
  );
}
