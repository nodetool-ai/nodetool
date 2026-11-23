/**
 * The `hf-downloads` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `hf-downloads.ts`, so nothing the
 * implementation pulls in reaches the entry graph.
 */

import type { CapabilitySpec } from "./types.js";

const REPO_ID_PROPERTY = {
  type: "string",
  description: "Hugging Face model repository, such as `org/name`."
} as const;

const PATH_PROPERTY = {
  type: "string",
  description:
    "One file in the repository to download instead of the whole repository."
} as const;

export const downloadHfModelSpec: CapabilitySpec = {
  name: "download_hf_model",
  description:
    "Download a Hugging Face model repository, or one file of it, into this " +
    "machine's Hugging Face cache, where local models load from. Before any " +
    "byte is written the user is asked to approve the repository and its " +
    "download size, every time. The call refuses when the download would " +
    "leave too little free disk space, and on a production server. Files " +
    "already in the cache are skipped. The download continues in the " +
    "background after the call returns: follow it with get_hf_download. " +
    "Nothing here deletes a model.",
  inputSchema: {
    type: "object",
    properties: {
      repo_id: REPO_ID_PROPERTY,
      path: PATH_PROPERTY,
      allow_patterns: {
        type: "array",
        items: { type: "string" },
        description: "Glob patterns a file must match to be downloaded."
      },
      ignore_patterns: {
        type: "array",
        items: { type: "string" },
        description: "Glob patterns of files to skip."
      }
    },
    required: ["repo_id"],
    additionalProperties: false
  },
  category: "external",
  userMessage: (args) =>
    `Downloading ${String(args["repo_id"] ?? "a model")} from Hugging Face`
};

export const getHfDownloadSpec: CapabilitySpec = {
  name: "get_hf_download",
  description:
    "Report the progress of a Hugging Face download started on this server: " +
    "status (start, progress, completed, error or cancelled), bytes and " +
    "files done, and the error when it failed. Returns status `unknown` for " +
    "a download this server process has not run.",
  inputSchema: {
    type: "object",
    properties: {
      repo_id: REPO_ID_PROPERTY,
      path: PATH_PROPERTY
    },
    required: ["repo_id"],
    additionalProperties: false
  },
  category: "read",
  userMessage: () => "Checking a Hugging Face download"
};

/** Every spec this module declares, in declaration order. */
export const hfDownloadsSpecs: readonly CapabilitySpec[] = [
  downloadHfModelSpec,
  getHfDownloadSpec
];
