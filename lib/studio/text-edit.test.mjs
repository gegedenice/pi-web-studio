import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { applyTabKey } = await createJiti(import.meta.url).import("./text-edit.ts");

test("Tab inserts two spaces at the cursor and replaces a selection within a line", () => {
  assert.deepEqual(applyTabKey("ab", 1, 1, false), { value: "a  b", start: 3, end: 3 });
  assert.deepEqual(applyTabKey("abcd", 1, 3, false), { value: "a  d", start: 3, end: 3 });
});

test("Tab indents and Shift+Tab outdents every selected line", () => {
  const text = "- un\n- deux\nfin";
  const indented = applyTabKey(text, 0, 10, false);
  assert.equal(indented.value, "  - un\n  - deux\nfin");
  assert.deepEqual([indented.start, indented.end], [2, 14]);
  const outdented = applyTabKey(indented.value, indented.start, indented.end, true);
  assert.equal(outdented.value, text);
  assert.deepEqual(applyTabKey("x\n y", 3, 3, true).value, "x\ny");
  assert.deepEqual(applyTabKey("x", 0, 0, true), { value: "x", start: 0, end: 0 });
});
