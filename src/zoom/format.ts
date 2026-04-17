import type { MarkdownTableMode } from "../config/types.base.js";
import { chunkMarkdownIR, markdownToIR, type MarkdownLinkSpan } from "../markdown/ir.js";
import { renderMarkdownWithMarkers } from "../markdown/render.js";

// Escape special characters for Zoom markdown format.
// Zoom uses similar format to Slack mrkdwn: *bold*, <url|text> for links
function escapeZoomMarkdownSegment(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ZOOM_ANGLE_TOKEN_RE = /<[^>\n]+>/g;

function isAllowedZoomAngleToken(token: string): boolean {
  if (!token.startsWith("<") || !token.endsWith(">")) {
    return false;
  }
  const inner = token.slice(1, -1);
  return (
    inner.startsWith("http://") ||
    inner.startsWith("https://") ||
    inner.startsWith("mailto:") ||
    inner.startsWith("tel:") ||
    inner.startsWith("img:")
  );
}

function escapeZoomMarkdownContent(text: string): string {
  if (!text.includes("&") && !text.includes("<") && !text.includes(">")) {
    return text;
  }

  ZOOM_ANGLE_TOKEN_RE.lastIndex = 0;
  const out: string[] = [];
  let lastIndex = 0;

  for (let match = ZOOM_ANGLE_TOKEN_RE.exec(text); match; match = ZOOM_ANGLE_TOKEN_RE.exec(text)) {
    const matchIndex = match.index ?? 0;
    out.push(escapeZoomMarkdownSegment(text.slice(lastIndex, matchIndex)));
    const token = match[0] ?? "";
    out.push(isAllowedZoomAngleToken(token) ? token : escapeZoomMarkdownSegment(token));
    lastIndex = matchIndex + token.length;
  }

  out.push(escapeZoomMarkdownSegment(text.slice(lastIndex)));
  return out.join("");
}

function escapeZoomMarkdownText(text: string): string {
  if (!text.includes("&") && !text.includes("<") && !text.includes(">")) {
    return text;
  }

  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("> ")) {
        return `> ${escapeZoomMarkdownContent(line.slice(2))}`;
      }
      return escapeZoomMarkdownContent(line);
    })
    .join("\n");
}

function buildZoomLink(link: MarkdownLinkSpan, text: string) {
  const href = link.href.trim();
  if (!href) {
    return null;
  }
  const label = text.slice(link.start, link.end);
  const trimmedLabel = label.trim();
  const comparableHref = href.startsWith("mailto:") ? href.slice("mailto:".length) : href;
  const useMarkup =
    trimmedLabel.length > 0 && trimmedLabel !== href && trimmedLabel !== comparableHref;
  if (!useMarkup) {
    return null;
  }
  const safeHref = escapeZoomMarkdownSegment(href);
  return {
    start: link.start,
    end: link.end,
    open: `<${safeHref}|`,
    close: ">",
  };
}

type ZoomMarkdownOptions = {
  tableMode?: MarkdownTableMode;
};

/**
 * Convert markdown to Zoom's markdown format.
 * Zoom supports: *bold*, <url|text> for links, <img:url> for images
 */
export function markdownToZoomFormat(markdown: string, options: ZoomMarkdownOptions = {}): string {
  const ir = markdownToIR(markdown ?? "", {
    linkify: false,
    autolink: false,
    headingStyle: "bold",
    blockquotePrefix: "> ",
    tableMode: options.tableMode,
  });

  return renderMarkdownWithMarkers(ir, {
    escapeText: escapeZoomMarkdownText,
    buildLink: buildZoomLink,
    styleMarkers: {
      bold: { open: "*", close: "*" },
      italic: { open: "_", close: "_" },
      strikethrough: { open: "~~", close: "~~" },
      code: { open: "`", close: "`" },
      code_block: { open: "```", close: "```" },
      spoiler: { open: "", close: "" }, // Zoom doesn't support spoilers
    },
  });
}

/**
 * Convert markdown to Zoom format and chunk it
 */
export function markdownToZoomFormatChunks(
  markdown: string,
  limit: number,
  options: ZoomMarkdownOptions = {},
): string[] {
  const ir = markdownToIR(markdown ?? "", {
    linkify: false,
    autolink: false,
    headingStyle: "bold",
    blockquotePrefix: "> ",
    tableMode: options.tableMode,
  });

  const chunks = chunkMarkdownIR(ir, limit);
  return chunks.map((chunk) =>
    renderMarkdownWithMarkers(chunk, {
      escapeText: escapeZoomMarkdownText,
      buildLink: buildZoomLink,
      styleMarkers: {
        bold: { open: "*", close: "*" },
        italic: { open: "_", close: "_" },
        strikethrough: { open: "~~", close: "~~" },
        code: { open: "`", close: "`" },
        code_block: { open: "```", close: "```" },
        spoiler: { open: "", close: "" },
      },
    }),
  );
}
