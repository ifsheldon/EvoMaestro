"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { citation } from "@/lib/publication";

export function Citation() {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copyCitation() {
    try {
      await navigator.clipboard.writeText(citation);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }
  return (
    <section className="citation-block" aria-label="BibTeX citation">
      <div className="citation-toolbar">
        <span>BibTeX</span>
        <button className="copy-button" type="button" onClick={copyCitation}>
          <Icon name={status === "copied" ? "check" : "copy"} />
          {status === "copied" ? "Copied" : "Copy citation"}
        </button>
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The overflowing citation must be keyboard-scrollable on narrow screens. */}
      <pre tabIndex={0}>
        <code>{citation}</code>
      </pre>
      <p
        className={status === "error" ? "copy-error" : "sr-only"}
        role="status"
      >
        {status === "copied"
          ? "Citation copied to clipboard."
          : status === "error"
            ? "Copying is unavailable. You can select and copy the citation above."
            : ""}
      </p>
    </section>
  );
}
