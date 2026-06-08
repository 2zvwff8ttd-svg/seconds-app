import Link from "next/link";
import type { ReactNode } from "react";

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    const label = match[1];
    const href = match[2];
    const key = `${keyPrefix}-link-${matchIndex}`;

    if (href.startsWith("/")) {
      nodes.push(
        <Link
          key={key}
          href={href}
          className="text-violet-300 underline decoration-violet-400/50 underline-offset-2 hover:text-violet-200"
        >
          {label}
        </Link>,
      );
    } else {
      nodes.push(
        <a
          key={key}
          href={href}
          className="text-violet-300 underline decoration-violet-400/50 underline-offset-2 hover:text-violet-200"
          target={href.startsWith("mailto:") ? undefined : "_blank"}
          rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
        >
          {label}
        </a>,
      );
    }

    lastIndex = index + match[0].length;
    matchIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "hr" };

function parseMarkdownBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ type: "ul", items: listItems });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === "") {
      flushList();
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      flushList();
      blocks.push({ type: "hr" });
      continue;
    }

    if (line.startsWith("# ")) {
      flushList();
      blocks.push({ type: "h1", text: line.slice(2).trim() });
      continue;
    }

    if (line.startsWith("### ")) {
      flushList();
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      continue;
    }

    if (line.startsWith("- ")) {
      listItems.push(line.slice(2).trim());
      continue;
    }

    flushList();
    blocks.push({ type: "p", text: line.trim() });
  }

  flushList();
  return blocks;
}

export function LegalMarkdown({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <article className="legal-prose">
      {blocks.map((block, index) => {
        const key = `block-${index}`;

        switch (block.type) {
          case "h1":
            return (
              <h1 key={key} className="legal-prose-h1">
                {block.text}
              </h1>
            );
          case "h2":
            return (
              <h2 key={key} className="legal-prose-h2">
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={key} className="legal-prose-h3">
                {block.text}
              </h3>
            );
          case "p":
            return (
              <p key={key} className="legal-prose-p">
                {renderInline(block.text, key)}
              </p>
            );
          case "ul":
            return (
              <ul key={key} className="legal-prose-ul">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-item-${itemIndex}`}>
                    {renderInline(item, `${key}-item-${itemIndex}`)}
                  </li>
                ))}
              </ul>
            );
          case "hr":
            return <hr key={key} className="legal-prose-hr" />;
          default:
            return null;
        }
      })}
    </article>
  );
}
