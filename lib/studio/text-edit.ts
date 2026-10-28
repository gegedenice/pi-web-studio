// Client-safe text editing helpers of the Studio's editor.

const INDENT = "  ";

/**
 * Tab and Shift+Tab on a textarea: indent or outdent the selected lines, or
 * insert two spaces at the cursor. Returns the new value and selection.
 */
export function applyTabKey(value: string, start: number, end: number, outdent: boolean): { value: string; start: number; end: number } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const multiline = value.slice(start, end).includes("\n");
  if (!outdent && !multiline) {
    return { value: value.slice(0, start) + INDENT + value.slice(end), start: start + INDENT.length, end: start + INDENT.length };
  }
  const blockEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const lines = value.slice(lineStart, blockEnd).split("\n");
  let firstShift = 0;
  let total = 0;
  const changed = lines.map((line, index) => {
    if (!outdent) {
      if (index === 0) firstShift = INDENT.length;
      total += INDENT.length;
      return INDENT + line;
    }
    const removed = line.startsWith(INDENT) ? INDENT.length : line.startsWith(" ") || line.startsWith("\t") ? 1 : 0;
    if (index === 0) firstShift = -removed;
    total -= removed;
    return line.slice(removed);
  });
  const next = value.slice(0, lineStart) + changed.join("\n") + value.slice(blockEnd);
  return {
    value: next,
    start: Math.max(lineStart, start + firstShift),
    end: Math.max(lineStart, end + total),
  };
}
