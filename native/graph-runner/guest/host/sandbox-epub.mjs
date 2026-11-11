// EPUB parsing stays over the explicitly supplied archive bytes. No temporary
// host path or ambient resource resolver is needed for the current contract.
import { unzipSync, strFromU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import { XMLParser } from "fast-xml-parser";
import {
  boundedUnzipFilter,
  requireBytes,
  optionsOf
} from "../../../../packages/agents/src/host-modules/limits.ts";
const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
const list = (value) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value) =>
  typeof value === "object" && value !== null
    ? String(value["#text"] ?? "")
    : String(value ?? "");
function resolve(base, reference) {
  const path = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (/^[a-z]+:/i.test(path) || path.startsWith("/"))
    throw new Error("EPUB resource is outside its archive");
  const parts = base.split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error("EPUB resource escapes its archive");
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
function book(bytes) {
  const files = unzipSync(requireBytes("epub", bytes), {
    filter: boundedUnzipFilter("epub")
  });
  const read = (path) => {
    if (!Object.hasOwn(files, path))
      throw new Error(`EPUB archive resource is missing: ${path}`);
    return strFromU8(files[path]);
  };
  const container = xml.parse(read("META-INF/container.xml"));
  const root = list(container.container?.rootfiles?.rootfile)[0]?.[
    "@_full-path"
  ];
  if (typeof root !== "string")
    throw new Error("EPUB container has no package document");
  const packagePath = resolve("", root),
    pkg = xml.parse(read(packagePath)).package;
  if (!pkg) throw new Error("EPUB package document is invalid");
  const manifest = new Map(
    list(pkg.manifest?.item).map((item) => [item["@_id"], item])
  );
  const flow = list(pkg.spine?.itemref)
    .map((item) => manifest.get(item["@_idref"]))
    .filter(Boolean);
  const meta = {};
  for (const [key, value] of Object.entries(pkg.metadata ?? {}))
    if (!key.startsWith("@_") && key !== "meta")
      meta[key] = Array.isArray(value) ? value.map(text) : text(value);
  if (meta.subject && !Array.isArray(meta.subject))
    meta.subject = [meta.subject];
  const chapters = flow.map((item) => ({
    id: item["@_id"],
    title: "",
    href: item["@_href"],
    text: read(resolve(packagePath, item["@_href"]))
  }));
  const toc = [];
  const ncx =
    manifest.get(pkg.spine?.["@_toc"]) ??
    [...manifest.values()].find(
      (item) => item["@_media-type"] === "application/x-dtbncx+xml"
    );
  if (ncx) {
    const visit = (points) => {
      for (const point of list(points)) {
        const href = point.content?.["@_src"];
        const chapter = chapters.find(
          (item) =>
            resolve(packagePath, item.href) ===
            resolve(resolve(packagePath, ncx["@_href"]), href ?? "")
        );
        const title = text(point.navLabel?.text);
        if (chapter) chapter.title = title;
        toc.push({
          id: point["@_id"],
          title,
          href,
          order: Number(point["@_playOrder"] ?? toc.length + 1)
        });
        visit(point.navPoint);
      }
    };
    visit(
      xml.parse(read(resolve(packagePath, ncx["@_href"]))).ncx?.navMap?.navPoint
    );
  } else {
    const nav = [...manifest.values()].find((item) =>
      String(item["@_properties"] ?? "")
        .split(/\s+/)
        .includes("nav")
    );
    if (nav) {
      const document = new DOMParser().parseFromString(
        read(resolve(packagePath, nav["@_href"])),
        "text/xml"
      );
      const navElement =
        Array.from(document.getElementsByTagName("nav")).find(
          (element) => element.getAttribute("epub:type") === "toc"
        ) ?? document.getElementsByTagName("nav")[0];
      if (navElement)
        for (const link of Array.from(navElement.getElementsByTagName("a")))
          toc.push({
            id: link.getAttribute("id") ?? undefined,
            title: link.textContent,
            href: link.getAttribute("href"),
            order: toc.length + 1
          });
    }
  }
  return { meta, toc, chapters };
}
function stripHtml(value) {
  return value
    .replace(/<style[\s\S]*?<\/style\b[^>]*>/gi, " ")
    .replace(/<script[\s\S]*?<\/script\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
export async function metadata(bytes) {
  return book(bytes).meta;
}
export async function tableOfContents(bytes) {
  return book(bytes).toc;
}
export async function extractChapters(bytes) {
  return book(bytes).chapters.map((chapter) => ({
    ...chapter,
    text: stripHtml(chapter.text)
  }));
}
export async function extractText(bytes, options) {
  return (await extractChapters(bytes))
    .map((chapter) => chapter.text)
    .join(String(optionsOf(options).chapterSeparator ?? "\n\n"));
}
