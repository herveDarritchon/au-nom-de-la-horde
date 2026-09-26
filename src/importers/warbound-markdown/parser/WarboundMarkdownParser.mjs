// Parser Warbound Markdown V1 — modèle interne neutre (aucune dépendance Foundry)

function parseFrontMatter(rawText) {
  const fmMatch = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return { frontMatter: null, rest: rawText };

  const yaml = fmMatch[1];
  const rest = rawText.slice(fmMatch[0].length);

  const field = (re) => { const m = yaml.match(re); return m ? m[1].trim() : undefined; };

  const schemaStr = field(/^\s+schema:\s*(.+)$/m);

  return {
    frontMatter: {
      schema: schemaStr !== undefined ? parseInt(schemaStr, 10) : undefined,
      id: field(/^\s+id:\s*(.+)$/m),
      title: field(/^\s+title:\s*(.+)$/m),
      type: field(/^\s+type:\s*(.+)$/m),
    },
    rest,
  };
}

function extractContext(body) {
  const idx = body.indexOf("<!-- warbound:table:start -->");
  return idx === -1 ? body.trim() : body.slice(0, idx).trim();
}

function extractTableSection(body) {
  const START = "<!-- warbound:table:start -->";
  const END = "<!-- warbound:table:end -->";
  const startIdx = body.indexOf(START);
  const endIdx = body.indexOf(END);
  if (startIdx === -1 || endIdx === -1) return "";
  return body.slice(startIdx + START.length, endIdx).trim();
}

function parseCells(line) {
  const parts = line.split("|");
  return parts.slice(1, parts.length - 1).map((c) => c.trim());
}

function parseTableRows(tableText) {
  if (!tableText) return [];
  const lines = tableText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));

  const sepIdx = lines.findIndex((l) => /^\|[\s|:\-]+\|$/.test(l));
  if (sepIdx === -1) return [];

  return lines.slice(sepIdx + 1).map((line) => {
    const [indexStr, id, title, summary, weightStr, activeStr] = parseCells(line);
    return {
      index: parseInt(indexStr, 10) || 0,
      id: (id ?? "").trim(),
      title: (title ?? "").trim(),
      summary: (summary ?? "").trim(),
      weight: parseInt(weightStr, 10) || 1,
      active: (activeStr ?? "").trim().toLowerCase() === "oui",
    };
  });
}

function extractEntryBlocks(body) {
  const ENTRY_START_RE = /<!--\s*warbound:entry\s+id="([^"]+)"\s*-->/g;
  const ENTRY_END = "<!-- warbound:entry:end -->";
  const blocks = new Map();
  let m;

  while ((m = ENTRY_START_RE.exec(body)) !== null) {
    const id = m[1];
    const contentStart = m.index + m[0].length;
    const endIdx = body.indexOf(ENTRY_END, contentStart);
    if (endIdx === -1) continue;
    const markdown = body.slice(contentStart, endIdx).trim();
    blocks.set(id, markdown);
  }

  return blocks;
}

// ── Markdown → HTML (zero-dep, subset suffisant pour le format Warbound) ──────

function renderInline(text) {
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/_(.+?)_/g, "<em>$1</em>");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  return text;
}

function parseCellAlignments(separatorLine) {
  return parseCells(separatorLine).map((cell) => {
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    if (cell.startsWith(":")) return "left";
    return "";
  });
}

function renderGfmTable(lines) {
  const alignments = parseCellAlignments(lines[1]);
  const attr = (i) => (alignments[i] ? ` style="text-align:${alignments[i]}"` : "");

  const headerHtml = parseCells(lines[0])
    .map((h, i) => `<th${attr(i)}>${renderInline(h)}</th>`)
    .join("");

  const bodyHtml = lines
    .slice(2)
    .map((line) => {
      const cellsHtml = parseCells(line)
        .map((c, i) => `<td${attr(i)}>${renderInline(c)}</td>`)
        .join("");
      return `<tr>${cellsHtml}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function mergeListItems(lines, prefixRe) {
  const items = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(prefixRe);
    if (m) {
      if (current !== null) items.push(current);
      current = m[1];
    } else if (current !== null) {
      current += " " + line.trim();
    }
  }
  if (current !== null) items.push(current);
  return items;
}

function renderBlock(block) {
  const lines = block.split("\n");
  const first = lines[0];

  const hMatch = first.match(/^(#{1,6})\s+(.*)/);
  if (hMatch) {
    const level = hMatch[1].length;
    return `<h${level}>${renderInline(hMatch[2])}</h${level}>`;
  }

  if (first.startsWith(">")) {
    const inner = lines.map((l) => l.replace(/^>\s?/, "")).join("\n");
    return `<blockquote>${markdownToHtml(inner)}</blockquote>`;
  }

  if (/^[-*+]\s/.test(first)) {
    const itemsHtml = mergeListItems(lines, /^[-*+]\s+(.*)/)
      .map((t) => `<li>${renderInline(t)}</li>`)
      .join("");
    return `<ul>${itemsHtml}</ul>`;
  }

  if (/^\d+\.\s/.test(first)) {
    const itemsHtml = mergeListItems(lines, /^\d+\.\s+(.*)/)
      .map((t) => `<li>${renderInline(t)}</li>`)
      .join("");
    return `<ol>${itemsHtml}</ol>`;
  }

  if (lines.length >= 2 && /^\|[\s|:\-]+\|$/.test(lines[1])) {
    return renderGfmTable(lines);
  }

  return `<p>${renderInline(lines.join(" "))}</p>`;
}

function markdownToHtml(markdown) {
  if (!markdown || !markdown.trim()) return "";
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  return normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map(renderBlock)
    .join("\n");
}

// ── Export principal ───────────────────────────────────────────────────────────

/**
 * @param {string} rawText - Contenu brut du fichier Markdown Warbound
 * @returns {import("./WarboundMarkdownParser.mjs").WarboundModel}
 */
export function parseWarboundMarkdown(rawText) {
  const { frontMatter, rest } = parseFrontMatter(rawText);

  const contextMd = extractContext(rest);
  const tableText = extractTableSection(rest);
  const tableRows = parseTableRows(tableText);
  const entryBlocks = extractEntryBlocks(rest);

  const entries = tableRows.map((row) => {
    const entryMd = entryBlocks.get(row.id) ?? "";
    return {
      index: row.index,
      id: row.id,
      title: row.title,
      summary: row.summary,
      weight: row.weight,
      active: row.active,
      markdown: entryMd,
      html: markdownToHtml(entryMd),
    };
  });

  return {
    schema: frontMatter?.schema,
    collectionId: frontMatter?.id,
    title: frontMatter?.title,
    type: frontMatter?.type,
    context: {
      markdown: contextMd,
      html: markdownToHtml(contextMd),
    },
    entries,
  };
}
