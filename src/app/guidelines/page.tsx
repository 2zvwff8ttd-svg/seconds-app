import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { loadLegalDocument } from "@/lib/legal/load-document";
import { LegalMarkdown } from "@/lib/legal/markdown";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "コンテンツガイドライン | ?Seconds",
};

export default function GuidelinesPage() {
  const doc = loadLegalDocument("guidelines");

  return (
    <LegalPageShell title={doc.title}>
      <LegalMarkdown content={doc.content} />
    </LegalPageShell>
  );
}
