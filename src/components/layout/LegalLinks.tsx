import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import Link from "next/link";

type LegalLinksProps = {
  className?: string;
  linkClassName?: string;
};

export function LegalLinks({
  className = "flex flex-wrap justify-center gap-x-4 gap-y-2",
  linkClassName = "text-muted transition hover:text-violet-300",
}: LegalLinksProps) {
  return (
    <nav className={className} aria-label="法的文書">
      {LEGAL_DOCUMENTS.map((doc) => (
        <Link key={doc.id} href={doc.href} className={linkClassName}>
          {doc.title}
        </Link>
      ))}
    </nav>
  );
}
