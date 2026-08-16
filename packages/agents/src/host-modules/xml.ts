/**
 * `@nodetool-ai/sandbox-xml` — fast-xml-parser, on the host.
 *
 * The library reads a bare `window`, which the guest does not have, so the
 * compiler refuses it as a guest module. It runs here instead.
 */

import { optionsOf, requireText, unwrapLibrary } from "./limits.js";

/**
 * A parsed XML document. Elements become objects, repeated elements become
 * arrays, and every leaf is a string — the parser is constructed below with
 * `parseTagValue`/`parseAttributeValue` off, so nothing is coerced to a number.
 */
export type XmlValue = string | XmlValue[] | { [key: string]: XmlValue };

interface FxpLike {
  XMLParser: new (opts?: Record<string, unknown>) => { parse: (xml: string) => XmlValue };
  XMLValidator: { validate: (xml: string) => true | { err: { msg: string } } };
}

async function loadFastXmlParser(where: string): Promise<FxpLike> {
  const mod: unknown = await import("fast-xml-parser");
  return unwrapLibrary<FxpLike>(
    mod,
    where,
    "fast-xml-parser",
    (v) => typeof (v as FxpLike | undefined)?.XMLParser === "function"
  );
}

/**
 * XML (RSS/Atom feeds, sitemaps) as a plain object.
 *
 * Attributes ride along prefixed `@_` so they never collide with child-element
 * keys, and text values stay text — a numeric-looking id must not change shape.
 * Invalid XML throws with the parser's own reason.
 */
export async function parse(text: unknown, options?: unknown): Promise<XmlValue> {
  const where = "xml.parse";
  const source = requireText(where, text);
  const opts = optionsOf(options);
  const fxp = await loadFastXmlParser(where);
  const valid = fxp.XMLValidator.validate(source);
  if (valid !== true) {
    throw new Error(`${where}: invalid XML (${valid.err.msg})`);
  }
  const parser = new fxp.XMLParser({
    ignoreAttributes: opts.attributes === false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true
  });
  return parser.parse(source);
}
