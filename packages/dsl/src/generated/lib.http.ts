// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, DataframeRef } from "../types.js";

// GET Request — lib.http.GetRequest
export interface GetRequestInputs {
  url?: Connectable<string>;
}

export interface GetRequestOutputs {
  output: string;
}

export function getRequest(inputs: GetRequestInputs): DslNode<GetRequestOutputs, "output"> {
  return createNode("lib.http.GetRequest", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// POST Request — lib.http.PostRequest
export interface PostRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<string>;
}

export interface PostRequestOutputs {
  output: string;
}

export function postRequest(inputs: PostRequestInputs): DslNode<PostRequestOutputs, "output"> {
  return createNode("lib.http.PostRequest", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// PUT Request — lib.http.PutRequest
export interface PutRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<string>;
}

export interface PutRequestOutputs {
  output: string;
}

export function putRequest(inputs: PutRequestInputs): DslNode<PutRequestOutputs, "output"> {
  return createNode("lib.http.PutRequest", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// DELETE Request — lib.http.DeleteRequest
export interface DeleteRequestInputs {
  url?: Connectable<string>;
}

export interface DeleteRequestOutputs {
  output: string;
}

export function deleteRequest(inputs: DeleteRequestInputs): DslNode<DeleteRequestOutputs, "output"> {
  return createNode("lib.http.DeleteRequest", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// HEAD Request — lib.http.HeadRequest
export interface HeadRequestInputs {
  url?: Connectable<string>;
}

export interface HeadRequestOutputs {
  output: Record<string, string>;
}

export function headRequest(inputs: HeadRequestInputs): DslNode<HeadRequestOutputs, "output"> {
  return createNode("lib.http.HeadRequest", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Fetch Page — lib.http.FetchPage
export interface FetchPageInputs {
  url?: Connectable<string>;
  wait_time?: Connectable<number>;
}

export interface FetchPageOutputs {
  html: string;
  success: boolean;
  error_message: string;
}

export function fetchPage(inputs: FetchPageInputs): DslNode<FetchPageOutputs> {
  return createNode("lib.http.FetchPage", inputs as Record<string, unknown>, { outputNames: ["html", "success", "error_message"] });
}

// Image Downloader — lib.http.ImageDownloader
export interface ImageDownloaderInputs {
  images?: Connectable<string[]>;
  base_url?: Connectable<string>;
  max_concurrent_downloads?: Connectable<number>;
}

export interface ImageDownloaderOutputs {
  images: ImageRef[];
  failed_urls: string[];
}

export function imageDownloader(inputs: ImageDownloaderInputs): DslNode<ImageDownloaderOutputs> {
  return createNode("lib.http.ImageDownloader", inputs as Record<string, unknown>, { outputNames: ["images", "failed_urls"] });
}

// GET Binary — lib.http.GetRequestBinary
export interface GetRequestBinaryInputs {
  url?: Connectable<string>;
}

export interface GetRequestBinaryOutputs {
  output: unknown;
}

export function getRequestBinary(inputs: GetRequestBinaryInputs): DslNode<GetRequestBinaryOutputs, "output"> {
  return createNode("lib.http.GetRequestBinary", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// GET Document — lib.http.GetRequestDocument
export interface GetRequestDocumentInputs {
  url?: Connectable<string>;
}

export interface GetRequestDocumentOutputs {
  output: unknown;
}

export function getRequestDocument(inputs: GetRequestDocumentInputs): DslNode<GetRequestDocumentOutputs, "output"> {
  return createNode("lib.http.GetRequestDocument", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// POST Binary — lib.http.PostRequestBinary
export interface PostRequestBinaryInputs {
  url?: Connectable<string>;
  data?: Connectable<string | unknown>;
}

export interface PostRequestBinaryOutputs {
  output: unknown;
}

export function postRequestBinary(inputs: PostRequestBinaryInputs): DslNode<PostRequestBinaryOutputs, "output"> {
  return createNode("lib.http.PostRequestBinary", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Download Dataframe — lib.http.DownloadDataframe
export interface DownloadDataframeInputs {
  url?: Connectable<string>;
  file_format?: Connectable<unknown>;
  columns?: Connectable<unknown>;
  encoding?: Connectable<string>;
  delimiter?: Connectable<string>;
}

export interface DownloadDataframeOutputs {
  output: DataframeRef;
}

export function downloadDataframe(inputs: DownloadDataframeInputs): DslNode<DownloadDataframeOutputs, "output"> {
  return createNode("lib.http.DownloadDataframe", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Filter Valid URLs — lib.http.FilterValidURLs
export interface FilterValidURLsInputs {
  url?: Connectable<string>;
  urls?: Connectable<string[]>;
  max_concurrent_requests?: Connectable<number>;
}

export interface FilterValidURLsOutputs {
  output: string[];
}

export function filterValidURLs(inputs: FilterValidURLsInputs): DslNode<FilterValidURLsOutputs, "output"> {
  return createNode("lib.http.FilterValidURLs", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Download Files — lib.http.DownloadFiles
export interface DownloadFilesInputs {
  urls?: Connectable<string[]>;
  output_folder?: Connectable<string>;
  max_concurrent_downloads?: Connectable<number>;
}

export interface DownloadFilesOutputs {
  success: string[];
  failed: string[];
}

export function downloadFiles(inputs: DownloadFilesInputs): DslNode<DownloadFilesOutputs> {
  return createNode("lib.http.DownloadFiles", inputs as Record<string, unknown>, { outputNames: ["success", "failed"] });
}

// POST JSON — lib.http.JSONPostRequest
export interface JSONPostRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
}

export interface JSONPostRequestOutputs {
  output: Record<string, unknown>;
}

export function jsonPostRequest(inputs: JSONPostRequestInputs): DslNode<JSONPostRequestOutputs, "output"> {
  return createNode("lib.http.JSONPostRequest", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// PUT JSON — lib.http.JSONPutRequest
export interface JSONPutRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
}

export interface JSONPutRequestOutputs {
  output: Record<string, unknown>;
}

export function jsonPutRequest(inputs: JSONPutRequestInputs): DslNode<JSONPutRequestOutputs, "output"> {
  return createNode("lib.http.JSONPutRequest", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// PATCH JSON — lib.http.JSONPatchRequest
export interface JSONPatchRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
}

export interface JSONPatchRequestOutputs {
  output: Record<string, unknown>;
}

export function jsonPatchRequest(inputs: JSONPatchRequestInputs): DslNode<JSONPatchRequestOutputs, "output"> {
  return createNode("lib.http.JSONPatchRequest", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// GET JSON — lib.http.JSONGetRequest
export interface JSONGetRequestInputs {
  url?: Connectable<string>;
}

export interface JSONGetRequestOutputs {
  output: Record<string, unknown>;
}

export function jsonGetRequest(inputs: JSONGetRequestInputs): DslNode<JSONGetRequestOutputs, "output"> {
  return createNode("lib.http.JSONGetRequest", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
