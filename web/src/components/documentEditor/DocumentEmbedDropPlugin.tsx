/**
 * Drop or paste media into a document. Files from the computer are saved
 * beside the document and embedded. Assets from the asset panel, files from
 * the Files panel and shots dragged from a storyboard are embedded where they
 * are dropped.
 */
import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import { resourceEmbedSrc } from "@nodetool-ai/protocol";
import {
  $createRangeSelection,
  $getNearestNodeFromDOMNode,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  type LexicalEditor
} from "lexical";

import type { Asset } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import { DRAG_DATA_MIME, deserializeDragData } from "../../lib/dragdrop/serialization";
import { trpcClient } from "../../trpc/client";
import { assetOfFile, isDocumentFile } from "../workspaces/workspaceTreeActions";
import { insertEmbeds } from "./documentCommands";
import type { DocumentLocation } from "./documentEditorContext";
import {
  captionFromName,
  embedForAsset,
  isEmbeddableFile,
  relativeDocumentPath,
  uploadEmbedFile,
  type DocumentEmbedInsert
} from "./documentEmbeds";

/** The legacy drag keys the asset panel still writes beside the unified one. */
const DRAG_TYPES = [DRAG_DATA_MIME, "asset", "selectedAssetIds", "timeline"];

/** Put the caret where the pointer is, as Lexical's own file drop does. */
function $selectAtPoint(editor: LexicalEditor, x: number, y: number): void {
  const doc = editor.getRootElement()?.ownerDocument ?? document;
  let domNode: Node | null = null;
  let offset = 0;
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    domNode = range?.startContainer ?? null;
    offset = range?.startOffset ?? 0;
  } else if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    domNode = position?.offsetNode ?? null;
    offset = position?.offset ?? 0;
  }
  if (domNode === null) {
    return;
  }
  const node = $getNearestNodeFromDOMNode(domNode);
  if (node === null) {
    return;
  }
  const selection = $createRangeSelection();
  if ($isTextNode(node)) {
    selection.anchor.set(node.getKey(), offset, "text");
    selection.focus.set(node.getKey(), offset, "text");
  } else {
    const parent = node.getParent();
    if (parent === null) {
      return;
    }
    const index = node.getIndexWithinParent() + 1;
    selection.anchor.set(parent.getKey(), index, "element");
    selection.focus.set(parent.getKey(), index, "element");
  }
  $setSelection(selection);
}

/**
 * The embeds a drag from inside NodeTool carries, or null when it carries
 * nothing a document embeds (a node, a sketch, plain text).
 */
export async function embedsFromDrag(
  dataTransfer: DataTransfer,
  location: DocumentLocation
): Promise<DocumentEmbedInsert[] | null> {
  const drag = deserializeDragData(dataTransfer);
  if (drag === null) {
    return null;
  }
  switch (drag.type) {
    case "asset":
      return [embedForAsset(drag.payload, location)];
    case "assets-multiple": {
      const get = useAssetStore.getState().get;
      const assets: Asset[] = await Promise.all(drag.payload.map((id) => get(id)));
      return assets.map((asset) => embedForAsset(asset, location));
    }
    case "storyboard-shot":
      return [
        {
          src: resourceEmbedSrc({
            kind: "shot",
            storyboardId: drag.payload.boardId,
            shotId: drag.payload.shotId
          }),
          alt: drag.payload.name
        }
      ];
    case "timeline":
      return [
        {
          src: resourceEmbedSrc({ kind: "timeline", timelineId: drag.payload.id }),
          alt: drag.payload.name
        }
      ];
    case "project-file": {
      const { projectId, path } = drag.payload;
      if (isDocumentFile(path)) {
        const document = await trpcClient.projects.documentByFile.query({
          id: projectId,
          path
        });
        if (document?.type === "timeline") {
          return [
            {
              src: resourceEmbedSrc({ kind: "timeline", timelineId: document.ref }),
              alt: document.name
            }
          ];
        }
        if (document?.type === "script") {
          return [
            {
              src: resourceEmbedSrc({ kind: "script", scriptId: document.ref }),
              alt: document.name
            }
          ];
        }
      }
      if (projectId === location.projectId) {
        return [{ src: relativeDocumentPath(location.path, path), alt: captionFromName(path) }];
      }
      const asset = await assetOfFile(projectId, path);
      return asset ? [embedForAsset(asset, location)] : null;
    }
    default:
      return null;
  }
}

interface DocumentEmbedDropPluginProps {
  location: DocumentLocation;
  /** Called when an upload or lookup fails, to tell the user. */
  onError: (error: unknown) => void;
}

export function DocumentEmbedDropPlugin({
  location,
  onError
}: DocumentEmbedDropPluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    /** Insert the embeds once they are known. The caret was set at the drop. */
    const insertWhenReady = (pending: Promise<DocumentEmbedInsert[] | null>) => {
      pending
        .then((embeds) => {
          if (embeds && embeds.length > 0) {
            insertEmbeds(editor, embeds);
          }
        })
        .catch(onError);
    };
    const carriesEmbed = (event: DragEvent): boolean =>
      DRAG_TYPES.some((type) => event.dataTransfer?.types.includes(type) ?? false);

    return mergeRegister(
      // Files from the computer, dropped or pasted: Lexical has set the caret.
      editor.registerCommand(
        DRAG_DROP_PASTE,
        (files) => {
          const media = files.filter(isEmbeddableFile);
          if (media.length === 0) {
            return false;
          }
          insertWhenReady(
            (async () => {
              const embeds: DocumentEmbedInsert[] = [];
              for (const file of media) {
                embeds.push(await uploadEmbedFile(file, location));
              }
              return embeds;
            })()
          );
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event) => {
          if (!carriesEmbed(event)) {
            return false;
          }
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          const dataTransfer = event.dataTransfer;
          if (!dataTransfer || !carriesEmbed(event)) {
            return false;
          }
          event.preventDefault();
          event.stopPropagation();
          editor.update(() => $selectAtPoint(editor, event.clientX, event.clientY));
          // Read the drag data now: it is gone once the event returns.
          insertWhenReady(embedsFromDrag(dataTransfer, location));
          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, location, onError]);

  return null;
}
