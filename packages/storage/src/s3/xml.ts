/**
 * Purpose-fit XML helpers for S3 REST responses.
 *
 * S3 responses are flat, attribute-free element trees (Error, ListBucketResult,
 * ListAllMyBucketsResult), so a scanning indexOf-based extractor covers them
 * without an XML dependency. Deliberately not a general XML parser.
 */

/**
 * String.fromCodePoint throws on out-of-range values; malformed XML from an
 * S3-compatible server must not turn into an exception, so invalid references
 * decode to null and the entity text is left intact.
 */
function codePointToString(code: number): string | null {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null;
  return String.fromCodePoint(code);
}

/** Decode the standard named entities plus numeric character references. */
export function decodeXmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  let out = "";
  let i = 0;
  while (i < text.length) {
    const amp = text.indexOf("&", i);
    if (amp === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, amp);
    const semi = text.indexOf(";", amp + 1);
    // Entities are short; a far-away semicolon means a bare ampersand.
    if (semi === -1 || semi - amp > 10) {
      out += "&";
      i = amp + 1;
      continue;
    }
    const entity = text.slice(amp + 1, semi);
    let decoded: string | null = null;
    switch (entity) {
      case "amp":
        decoded = "&";
        break;
      case "lt":
        decoded = "<";
        break;
      case "gt":
        decoded = ">";
        break;
      case "quot":
        decoded = '"';
        break;
      case "apos":
        decoded = "'";
        break;
      default:
        if (entity.startsWith("#x") || entity.startsWith("#X")) {
          decoded = codePointToString(Number.parseInt(entity.slice(2), 16));
        } else if (entity.startsWith("#")) {
          decoded = codePointToString(Number.parseInt(entity.slice(1), 10));
        }
    }
    if (decoded === null) {
      out += "&";
      i = amp + 1;
    } else {
      out += decoded;
      i = semi + 1;
    }
  }
  return out;
}

function xmlInner(xml: string, tag: string, from = 0): string | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open, from);
  if (start === -1) return null;
  const end = xml.indexOf(close, start + open.length);
  if (end === -1) return null;
  return xml.slice(start + open.length, end);
}

/**
 * Text content of the first `<tag>…</tag>` occurrence, entity-decoded.
 * Null when the element is absent (or self-closing).
 */
export function xmlText(xml: string, tag: string): string | null {
  const inner = xmlInner(xml, tag);
  return inner === null ? null : decodeXmlEntities(inner);
}

/**
 * Raw inner content of every `<tag>…</tag>` occurrence, in document order.
 * Not entity-decoded — meant for blocks containing nested elements.
 */
export function xmlBlocks(xml: string, tag: string): string[] {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const start = xml.indexOf(open, from);
    if (start === -1) break;
    const end = xml.indexOf(close, start + open.length);
    if (end === -1) break;
    blocks.push(xml.slice(start + open.length, end));
    from = end + close.length;
  }
  return blocks;
}
