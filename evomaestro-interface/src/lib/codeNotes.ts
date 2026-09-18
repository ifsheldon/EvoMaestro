/**
 * Parse ```note{...} blocks from Maestro messages and provide helpers
 * for Monaco editor decorations.
 *
 * Format:
 *   ```note{10:20}        — annotate lines 10–20 (single editor / code view)
 *   ```note{left:10:20}   — annotate lines 10–20 in the left (original) editor
 *   ```note{right:10:20}  — annotate lines 10–20 in the right (modified) editor
 *
 * The body between the opening fence and the closing ``` is the note text.
 */

export interface CodeNote {
  /** Which editor pane: "left", "right", or null (single editor). */
  side: "left" | "right" | null;
  /** 1-based start line. */
  startLine: number;
  /** 1-based end line (inclusive). */
  endLine: number;
  /** The note text. */
  text: string;
}

const NOTE_BLOCK_RE =
  /```note\{(?:(left|right):)?(\d+):(\d+)\}\s*\n([\s\S]*?)```/g;

/**
 * Extract all code-note blocks from a message string.
 */
export function parseCodeNotes(content: string): CodeNote[] {
  const notes: CodeNote[] = [];
  NOTE_BLOCK_RE.lastIndex = 0;
  for (
    let match = NOTE_BLOCK_RE.exec(content);
    match !== null;
    match = NOTE_BLOCK_RE.exec(content)
  ) {
    const side = (match[1] as "left" | "right" | undefined) ?? null;
    const startLine = Number.parseInt(match[2], 10);
    const endLine = Number.parseInt(match[3], 10);
    const text = match[4].trim();
    if (startLine > 0 && endLine >= startLine && text) {
      notes.push({ side, startLine, endLine, text });
    }
  }
  return notes;
}
