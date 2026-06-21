/**
 * Platform-tag guard for the IMAGE_SERVER_NODES split.
 *
 * `tagAsServer` declares node+workers+edge, but it skips any class that already
 * declares `static platforms`. The filesystem-bound nodes (Load/Save/Folder/
 * Assets) and the sharp-bound nodes (GetMetadata, Painter) pin themselves to
 * `["node"]` because the workers/edge V8 isolates have no filesystem and no
 * native addons. The pure-JS list nodes and the provider/HTTP generation nodes
 * keep the full server set.
 *
 * This pins that contract so a future retag (e.g. accidentally broadening a
 * node-only node back to the server set, or dropping a generation node off
 * workers/edge) fails loudly here. Pure JS — no native deps, runs anywhere.
 */
import { describe, it, expect } from "vitest";
import { supportsPlatform, type Platform } from "@nodetool-ai/protocol";
import {
  LoadImageFileNode,
  LoadImageFolderNode,
  SaveImageFileImageNode,
  LoadImageAssetsNode,
  SaveImageNode,
  GetMetadataNode,
  PainterNode,
  BatchToListNode,
  ImagesToListNode,
  TextToImageNode,
  ImageToImageNode,
  UpscaleImageNode,
  RemoveBackgroundNode,
  RelightImageNode,
  VectorizeImageNode
} from "@nodetool-ai/image-nodes";

type NodeClassLike = {
  nodeType?: string;
  platforms?: readonly Platform[];
};

// Filesystem- or sharp-bound: must run on node, never on workers/edge/browser.
const NODE_ONLY_NODES: NodeClassLike[] = [
  LoadImageFileNode,
  LoadImageFolderNode,
  SaveImageFileImageNode,
  LoadImageAssetsNode,
  SaveImageNode,
  GetMetadataNode,
  PainterNode
];

// Pure-JS list nodes + provider/HTTP generation nodes: full server set
// (node+workers+edge), but never the browser.
const SERVER_PORTABLE_NODES: NodeClassLike[] = [
  BatchToListNode,
  ImagesToListNode,
  TextToImageNode,
  ImageToImageNode,
  UpscaleImageNode,
  RemoveBackgroundNode,
  RelightImageNode,
  VectorizeImageNode
];

describe("IMAGE_SERVER_NODES platform split", () => {
  describe("filesystem / sharp-bound nodes are node-only", () => {
    for (const cls of NODE_ONLY_NODES) {
      it(`${cls.nodeType} supports only node`, () => {
        expect(
          supportsPlatform(cls.platforms, "node"),
          `${cls.nodeType} must support node`
        ).toBe(true);
        expect(
          supportsPlatform(cls.platforms, "workers"),
          `${cls.nodeType} must NOT support workers`
        ).toBe(false);
        expect(
          supportsPlatform(cls.platforms, "edge"),
          `${cls.nodeType} must NOT support edge`
        ).toBe(false);
        expect(
          supportsPlatform(cls.platforms, "browser"),
          `${cls.nodeType} must NOT support browser`
        ).toBe(false);
      });
    }
  });

  describe("pure-JS / provider nodes stay node+workers+edge (not browser)", () => {
    for (const cls of SERVER_PORTABLE_NODES) {
      it(`${cls.nodeType} supports node, workers, edge`, () => {
        expect(
          supportsPlatform(cls.platforms, "node"),
          `${cls.nodeType} must support node`
        ).toBe(true);
        expect(
          supportsPlatform(cls.platforms, "workers"),
          `${cls.nodeType} must support workers`
        ).toBe(true);
        expect(
          supportsPlatform(cls.platforms, "edge"),
          `${cls.nodeType} must support edge`
        ).toBe(true);
        expect(
          supportsPlatform(cls.platforms, "browser"),
          `${cls.nodeType} must NOT support browser`
        ).toBe(false);
      });
    }
  });
});
