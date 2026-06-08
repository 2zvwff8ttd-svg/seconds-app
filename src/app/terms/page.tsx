import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { loadLegalDocument } from "@/lib/legal/load-document";
import { LegalMarkdown } from "@/lib/legal/markdown";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約 | ?Seconds",
};

export default function TermsPage() {
  const doc = loadLegalDocument("terms");

  return (
    <LegalPageShell title={doc.title}>
      <LegalMarkdown content={doc.content} />
    </LegalPageShell>
  );
}
