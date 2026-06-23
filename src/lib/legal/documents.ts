export const SUPPORT_EMAIL = "support@getseconds.app";

export type LegalDocumentId = "privacy" | "terms" | "guidelines";

export type LegalDocumentMeta = {
  id: LegalDocumentId;
  title: string;
  href: string;
  filename: string;
};

export const LEGAL_DOCUMENTS: readonly LegalDocumentMeta[] = [
  {
    id: "privacy",
    title: "プライバシーポリシー",
    href: "/privacy",
    filename: "privacy.md",
  },
  {
    id: "terms",
    title: "利用規約",
    href: "/terms",
    filename: "terms.md",
  },
  {
    id: "guidelines",
    title: "コンテンツガイドライン",
    href: "/guidelines",
    filename: "guidelines.md",
  },
] as const;

export function getLegalDocumentMeta(id: LegalDocumentId): LegalDocumentMeta {
  const doc = LEGAL_DOCUMENTS.find((item) => item.id === id);
  if (!doc) throw new Error(`Unknown legal document: ${id}`);
  return doc;
}
