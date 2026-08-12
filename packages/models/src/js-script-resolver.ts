/**
 * The database-backed {@link JsScriptResolver}: a pinned `{id, version}` link
 * to the document that version snapshotted.
 *
 * Version 0 is not a version — a link is always pinned to a real snapshot — so
 * a link naming a version no row carries resolves to null, which every caller
 * reports as a dangling link rather than falling back to the live document.
 * Scripts are per-user, like sketches and timelines: another owner's script
 * reads as absent.
 */
import type {
  JsScriptDocument,
  JsScriptLink,
  JsScriptResolver,
  ResolvedJsScript
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { JsScript } from "./js-script.js";
import { JsScriptVersion } from "./js-script-version.js";

export function createJsScriptResolver(): JsScriptResolver {
  return {
    async resolve(
      link: JsScriptLink,
      userId?: string
    ): Promise<ResolvedJsScript | null> {
      const script = await JsScript.findById(link.id);
      if (!script) return null;
      if (userId !== undefined && script.user_id !== userId) return null;

      const version = await JsScriptVersion.findByVersion(
        link.id,
        link.version
      );
      if (!version) return null;

      let document: JsScriptDocument;
      try {
        document = JSON.parse(version.document) as JsScriptDocument;
      } catch {
        return null;
      }
      return {
        id: script.id,
        name: script.name,
        version: version.version,
        document
      };
    }
  };
}
