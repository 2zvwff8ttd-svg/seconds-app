import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getLegalDocumentMeta,
  type LegalDocumentId,
} from "@/lib/legal/documents";

export type LoadedLegalDocument = {
  id: LegalDocumentId;
  title: string;
  content: string;
};

export function loadLegalDocument(id: LegalDocumentId): LoadedLegalDocument {
  const meta = getLegalDocumentMeta(id);
  const filePath = join(process.cwd(), "content", "legal", meta.filename);
  const content = readFileSync(filePath, "utf8");

  return {
    id: meta.id,
    title: meta.title,
    content,
  };
}
