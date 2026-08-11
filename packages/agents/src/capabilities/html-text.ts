/**
 * Linear HTML-to-text stripping primitives, shared by the `web` and `email`
 * capability modules.
 *
 * Everything here is an index scan, not a regex over the tag body: a page is
 * library input, and both `<[^>]*>` and any `<script…</script>` regex go
 * quadratic on adversarial runs of `<`. The outputs feed a model as plain
 * text — this is readability stripping, not render sanitization.
 */

/**
 * Remove every `<tagName …>…</tagName …>` block — tolerant of anything
 * before the closing `>` (`</script\t\n bar>`). An unclosed block drops the
 * rest of the input: script or style content is never text.
 */
export function stripElement(input: string, tagName: string): string {
  const lower = input.toLowerCase();
  const open = `<${tagName}`;
  const close = `</${tagName}`;
  let out = "";
  let i = 0;
  for (;;) {
    const start = lower.indexOf(open, i);
    if (start === -1) return out + input.slice(i);
    // Only a real tag boundary opens a block: "<scripted>" is not "<script>".
    const after = lower.charCodeAt(start + open.length);
    const boundary =
      Number.isNaN(after) || after === 0x3e || after === 0x2f || after <= 0x20;
    if (!boundary) {
      out += input.slice(i, start + open.length);
      i = start + open.length;
      continue;
    }
    out += input.slice(i, start);
    const closeAt = lower.indexOf(close, start + open.length);
    if (closeAt === -1) return out;
    const gt = input.indexOf(">", closeAt + close.length);
    if (gt === -1) return out;
    i = gt + 1;
  }
}

/**
 * Remove every `<…>` span, matching what `/<[^>]*>/g` removes — the span runs
 * from a `<` to the first `>` after it — without the quadratic rescans that
 * regex pays on a run of `<` with no `>`. A trailing `<` with no `>` stays
 * text ("5 < 6").
 */
export function stripTags(input: string): string {
  let out = "";
  let i = 0;
  for (;;) {
    const lt = input.indexOf("<", i);
    if (lt === -1) return out + input.slice(i);
    const gt = input.indexOf(">", lt + 1);
    if (gt === -1) return out + input.slice(i);
    out += input.slice(i, lt);
    i = gt + 1;
  }
}

/**
 * Strip until a pass changes nothing, so removed fragments cannot reassemble
 * into a new match ("<scr<script>ipt>" → "<script>").
 */
export function stripToFixpoint(
  input: string,
  strip: (text: string) => string
): string {
  let out = input;
  for (;;) {
    const next = strip(out);
    if (next === out) return out;
    out = next;
  }
}
