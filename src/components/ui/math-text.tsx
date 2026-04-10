"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Render text that may contain inline LaTeX math.
 * Supports both \(...\) and $...$ delimiters.
 * Non-math text is rendered as-is.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMathInText(text), [text]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Parse text and render LaTeX segments.
 * Handles: \(...\), $...$, and $$...$$ delimiters.
 */
function renderMathInText(text: string): string {
  // Match \(...\) or $...$ (non-greedy)
  const pattern = /\\\((.+?)\\\)|\$\$(.+?)\$\$|\$(.+?)\$/g;

  let result = "";
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    // Add text before this match (escaped for HTML)
    result += escapeHtml(text.slice(lastIndex, match.index));

    const latex = match[1] ?? match[2] ?? match[3] ?? "";
    const displayMode = match[2] !== undefined; // $$ is display mode

    try {
      result += katex.renderToString(latex, {
        throwOnError: false,
        displayMode,
        output: "html",
      });
    } catch {
      // Fallback: show raw LaTeX
      result += escapeHtml(match[0]);
    }

    lastIndex = match.index! + match[0].length;
  }

  // Add remaining text
  result += escapeHtml(text.slice(lastIndex));

  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
