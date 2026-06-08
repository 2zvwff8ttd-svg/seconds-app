import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { loadLegalDocument } from "@/lib/legal/load-document";
import { LegalMarkdown } from "@/lib/legal/markdown";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー | ?Seconds",
};

export default function PrivacyPage() {
  const doc = loadLegalDocument("privacy");

  return (
    <LegalPageShell title={doc.title}>
      <LegalMarkdown content={doc.content} />
    </LegalPageShell>
  );
}
