import { marked } from "marked";
import fixtures from "@/fixtures/guide-summary.json";
import type { AppLocale } from "@/i18n/config";

export function extractGlobalInsights(content: string): string {
  const tokens = marked.lexer(content);
  const start = tokens.findIndex(
    (token) =>
      token.type === "heading" &&
      token.depth === 1 &&
      token.text === "GLOBAL INSIGHTS SCRATCHPAD",
  );
  if (start < 0) return content.trim();
  const body = tokens.slice(start + 1);
  const end = body.findIndex(
    (token) => token.type === "heading" && token.depth === 1,
  );
  return (end < 0 ? body : body.slice(0, end))
    .map((token) => token.raw)
    .join("")
    .trim();
}

/** Select display content only after loading succeeds; errors remain errors. */
export function overviewContent(
  content: string | null,
  openedByGuide: boolean,
  packagedExample: boolean,
  locale: AppLocale,
): { content: string; label: string | null } | null {
  const hasContent = Boolean(content?.trim());
  if ((hasContent && packagedExample) || (!hasContent && openedByGuide)) {
    return fixtures[locale];
  }
  return hasContent ? { content: content ?? "", label: null } : null;
}
