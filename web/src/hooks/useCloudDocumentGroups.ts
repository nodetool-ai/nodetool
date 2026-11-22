/**
 * The navigator's Cloud and Shared with me groups in the desktop app (PRD
 * flow "Open and edit a cloud document"; WP1.15). They list the signed-in
 * account's documents on its cloud server, and the documents others shared
 * with it there, through the cloud client. Workflows and timelines, as in
 * the native apps' cloud browser, and JS scripts, whose file references the
 * server checks since WP2.10 (D26).
 *
 * The query keys start with the server and the account (TC124), so a local
 * and a cloud document with the same id never share a cache entry, and
 * another account's lists are never shown.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { cloudTrpcClient, useCloudOrigin } from "../lib/cloud/cloudAccount";
import { originQueryKey, type DocumentOrigin } from "../lib/cloud/documentOrigin";
import {
  DOCUMENT_TYPE_LABELS,
  UNTITLED_DOCUMENT_NAMES,
  type DocumentTreeGroup,
  type DocumentTreeLeaf
} from "./useDocumentTreeData";

/** The native cloud browser's bounds (`cloud_listing.h`). */
export const CLOUD_LIST_PAGE_SIZE = 200;
export const CLOUD_LIST_MAX_PAGES = 10;
const CLOUD_LIST_STALE_TIME = 30_000;

type CloudOrigin = Extract<DocumentOrigin, { kind: "cloud" }>;

interface Listed {
  readonly id: string;
  readonly name: string;
  readonly type: "workflow" | "timeline" | "jsscript";
  readonly updatedAt: string;
  readonly role?: "viewer" | "editor";
}

async function ownDocuments(origin: CloudOrigin, signal: AbortSignal): Promise<Listed[]> {
  const client = cloudTrpcClient(origin.server);
  if (!client) {
    return [];
  }
  const listed: Listed[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < CLOUD_LIST_MAX_PAGES; page += 1) {
    const input: { limit: number; cursor?: string } = { limit: CLOUD_LIST_PAGE_SIZE };
    if (cursor) {
      input.cursor = cursor;
    }
    const answer = await client.workflows.list.query(input, { signal });
    for (const workflow of answer.workflows) {
      listed.push({
        id: workflow.id,
        name: workflow.name,
        type: "workflow",
        updatedAt: workflow.updated_at ?? ""
      });
    }
    cursor = answer.next ?? undefined;
    if (!cursor) {
      break;
    }
  }
  const timelines = await client.timeline.list.query({}, { signal });
  for (const timeline of timelines) {
    listed.push({ id: timeline.id, name: timeline.name, type: "timeline", updatedAt: timeline.updatedAt });
  }
  const scripts = await client.jsScripts.list.query({}, { signal });
  for (const script of scripts) {
    listed.push({ id: script.id, name: script.name, type: "jsscript", updatedAt: script.updatedAt });
  }
  return listed;
}

async function sharedDocuments(origin: CloudOrigin, signal: AbortSignal): Promise<Listed[]> {
  const client = cloudTrpcClient(origin.server);
  if (!client) {
    return [];
  }
  const [workflows, documents] = await Promise.all([
    client.workflows.sharing.sharedWithMe.query({ limit: CLOUD_LIST_PAGE_SIZE }, { signal }),
    client.documentSharing.sharedWithMe.query(undefined, { signal })
  ]);
  const listed: Listed[] = workflows.workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    type: "workflow",
    updatedAt: workflow.updated_at ?? "",
    role: workflow.shared_role
  }));
  for (const document of documents.documents) {
    // The list holds every shared kind. Only these open here (D26).
    if (document.type === "timeline" || document.type === "jsscript") {
      listed.push({
        id: document.id,
        name: document.name,
        type: document.type,
        updatedAt: document.updated_at ?? "",
        role: document.role
      });
    }
  }
  return listed;
}

function toLeaves(listed: readonly Listed[], origin: CloudOrigin): DocumentTreeLeaf[] {
  // ISO 8601 in one zone, so text order is time order. Newest first.
  return [...listed]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .map((document) => {
      const leaf: { -readonly [K in keyof DocumentTreeLeaf]: DocumentTreeLeaf[K] } = {
        id: document.id,
        name: document.name || UNTITLED_DOCUMENT_NAMES[document.type],
        type: document.type,
        typeLabel: DOCUMENT_TYPE_LABELS[document.type],
        origin
      };
      if (document.role) {
        leaf.sharedRole = document.role;
      }
      return leaf;
    });
}

export interface CloudDocumentGroups {
  readonly groups: readonly DocumentTreeGroup[];
  /** Why a list could not be read, or null. */
  readonly error: Error | null;
}

const NO_GROUPS: CloudDocumentGroups = { groups: [], error: null };

/** Nothing outside the desktop app, and nothing while signed out. */
export const useCloudDocumentGroups = (): CloudDocumentGroups => {
  const origin = useCloudOrigin();
  const own = useQuery({
    queryKey: originQueryKey(origin ?? { kind: "local" }, ["cloudDocuments", "own"]),
    queryFn: ({ signal }) => (origin ? ownDocuments(origin, signal) : Promise.resolve([])),
    enabled: origin !== null,
    staleTime: CLOUD_LIST_STALE_TIME,
    retry: false
  });
  const shared = useQuery({
    queryKey: originQueryKey(origin ?? { kind: "local" }, ["cloudDocuments", "shared"]),
    queryFn: ({ signal }) => (origin ? sharedDocuments(origin, signal) : Promise.resolve([])),
    enabled: origin !== null,
    staleTime: CLOUD_LIST_STALE_TIME,
    retry: false
  });

  return useMemo(() => {
    if (!origin) {
      return NO_GROUPS;
    }
    const groups: DocumentTreeGroup[] = [];
    const ownLeaves = toLeaves(own.data ?? [], origin);
    if (ownLeaves.length > 0) {
      groups.push({ id: "cloud", label: "Cloud", children: ownLeaves });
    }
    const sharedLeaves = toLeaves(shared.data ?? [], origin);
    if (sharedLeaves.length > 0) {
      groups.push({ id: "cloudShared", label: "Shared with me", children: sharedLeaves });
    }
    const error = own.error ?? shared.error;
    return { groups, error: error instanceof Error ? error : null };
  }, [origin, own.data, own.error, shared.data, shared.error]);
};
