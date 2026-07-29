/**
 * Atlassian Document Format → plain markdown-ish text.
 *
 * Jira Cloud returns rich text as an ADF JSON tree. Downstream agents work on
 * text, so this walker flattens the tree keeping the structure that matters
 * for analysis (headings, lists, code blocks, tables) and dropping styling.
 * Unknown node types degrade to their text content instead of throwing —
 * Atlassian adds node types faster than anyone can track them.
 */

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
}

export function isAdf(value: unknown): value is AdfNode {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as AdfNode).type === "doc" &&
    Array.isArray((value as AdfNode).content)
  );
}

export function adfToText(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node !== "object" || node === null) return "";
  return renderBlocks((node as AdfNode).content ?? []).trim();
}

function renderBlocks(nodes: AdfNode[], indent = ""): string {
  return nodes.map((n) => renderBlock(n, indent)).filter(Boolean).join("\n");
}

function renderBlock(node: AdfNode, indent: string): string {
  switch (node.type) {
    case "paragraph":
      return indent + inline(node);
    case "heading": {
      const level = Number(node.attrs?.["level"] ?? 1);
      return `${"#".repeat(Math.min(6, Math.max(1, level)))} ${inline(node)}`;
    }
    case "bulletList":
      return (node.content ?? [])
        .map((li) => `${indent}- ${listItem(li, indent)}`)
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${indent}${i + 1}. ${listItem(li, indent)}`)
        .join("\n");
    case "codeBlock":
      return `\`\`\`\n${inline(node)}\n\`\`\``;
    case "blockquote":
      return renderBlocks(node.content ?? [], indent)
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "rule":
      return "---";
    case "table":
      return renderTable(node);
    case "mediaGroup":
    case "mediaSingle":
      return `${indent}[attachment]`;
    case "panel":
      return renderBlocks(node.content ?? [], indent);
    default:
      // Unknown block: salvage its inline text rather than dropping content.
      return node.content ? renderBlocks(node.content, indent) : inline(node);
  }
}

function listItem(li: AdfNode, indent: string): string {
  const parts = (li.content ?? []).map((child, i) =>
    i === 0 ? renderBlock(child, "").trimStart() : renderBlock(child, indent + "  "),
  );
  return parts.filter(Boolean).join("\n");
}

function renderTable(table: AdfNode): string {
  const rows = (table.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => renderBlocks(cell.content ?? []).replace(/\n/g, " ")),
  );
  return rows.map((cells) => `| ${cells.join(" | ")} |`).join("\n");
}

function inline(node: AdfNode): string {
  if (node.text !== undefined) return node.text;
  return (node.content ?? [])
    .map((child) => {
      switch (child.type) {
        case "hardBreak":
          return "\n";
        case "mention":
          // Privacy: mentions carry account ids and display names. Keep only a
          // neutral role marker — names are PII the pipeline doesn't need.
          return "[person]";
        case "emoji":
          return String(child.attrs?.["shortName"] ?? "");
        case "inlineCard":
          return String(child.attrs?.["url"] ?? "[link]");
        case "status":
          return String(child.attrs?.["text"] ?? "");
        default:
          return inline(child);
      }
    })
    .join("");
}
