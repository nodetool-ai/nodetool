// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef, DataframeRef } from "../types.js";

// GET Request — lib.http.GetRequest
export interface GetRequestInputs {
  url?: Connectable<string>;
}

export function getRequest(inputs: GetRequestInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.http.GetRequest", inputs as Record<string, unknown>);
}

// POST Request — lib.http.PostRequest
export interface PostRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<string>;
}

export function postRequest(inputs: PostRequestInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.http.PostRequest", inputs as Record<string, unknown>);
}

// PUT Request — lib.http.PutRequest
export interface PutRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<string>;
}

export function putRequest(inputs: PutRequestInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.http.PutRequest", inputs as Record<string, unknown>);
}

// DELETE Request — lib.http.DeleteRequest
export interface DeleteRequestInputs {
  url?: Connectable<string>;
}

export function deleteRequest(inputs: DeleteRequestInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.http.DeleteRequest", inputs as Record<string, unknown>);
}

// HEAD Request — lib.http.HeadRequest
export interface HeadRequestInputs {
  url?: Connectable<string>;
}

export function headRequest(inputs: HeadRequestInputs): DslNode<SingleOutput<Record<string, string>>> {
  return createNode("lib.http.HeadRequest", inputs as Record<string, unknown>);
}

// Fetch Page — lib.http.FetchPage
export interface FetchPageInputs {
  url?: Connectable<string>;
  wait_time?: Connectable<number>;
}

export interface FetchPageOutputs {
  html: OutputHandle<string>;
  success: OutputHandle<boolean>;
  error_message: OutputHandle<string>;
}

export function fetchPage(inputs: FetchPageInputs): DslNode<FetchPageOutputs> {
  return createNode("lib.http.FetchPage", inputs as Record<string, unknown>, { multiOutput: true });
}

// Image Downloader — lib.http.ImageDownloader
export interface ImageDownloaderInputs {
  images?: Connectable<string[]>;
  base_url?: Connectable<string>;
  max_concurrent_downloads?: Connectable<number>;
}

export interface ImageDownloaderOutputs {
  images: OutputHandle<ImageRef[]>;
  failed_urls: OutputHandle<string[]>;
}

export function imageDownloader(inputs: ImageDownloaderInputs): DslNode<ImageDownloaderOutputs> {
  return createNode("lib.http.ImageDownloader", inputs as Record<string, unknown>, { multiOutput: true });
}

// GET Binary — lib.http.GetRequestBinary
export interface GetRequestBinaryInputs {
  url?: Connectable<string>;
}

export function getRequestBinary(inputs: GetRequestBinaryInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.http.GetRequestBinary", inputs as Record<string, unknown>);
}

// GET Document — lib.http.GetRequestDocument
export interface GetRequestDocumentInputs {
  url?: Connectable<string>;
}

export function getRequestDocument(inputs: GetRequestDocumentInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.http.GetRequestDocument", inputs as Record<string, unknown>);
}

// POST Binary — lib.http.PostRequestBinary
export interface PostRequestBinaryInputs {
  url?: Connectable<string>;
  data?: Connectable<string | unknown>;
}

export function postRequestBinary(inputs: PostRequestBinaryInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.http.PostRequestBinary", inputs as Record<string, unknown>);
}

// Download Dataframe — lib.http.DownloadDataframe
export interface DownloadDataframeInputs {
  url?: Connectable<string>;
  file_format?: Connectable<unknown>;
  columns?: Connectable<unknown>;
  encoding?: Connectable<string>;
  delimiter?: Connectable<string>;
}

export function downloadDataframe(inputs: DownloadDataframeInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("lib.http.DownloadDataframe", inputs as Record<string, unknown>);
}

// Filter Valid URLs — lib.http.FilterValidURLs
export interface FilterValidURLsInputs {
  url?: Connectable<string>;
  urls?: Connectable<string[]>;
  max_concurrent_requests?: Connectable<number>;
}

export function filterValidURLs(inputs: FilterValidURLsInputs): DslNode<SingleOutput<string[]>> {
  return createNode("lib.http.FilterValidURLs", inputs as Record<string, unknown>);
}

// Download Files — lib.http.DownloadFiles
export interface DownloadFilesInputs {
  urls?: Connectable<string[]>;
  output_folder?: Connectable<string>;
  max_concurrent_downloads?: Connectable<number>;
}

export interface DownloadFilesOutputs {
  success: OutputHandle<string[]>;
  failed: OutputHandle<string[]>;
}

export function downloadFiles(inputs: DownloadFilesInputs): DslNode<DownloadFilesOutputs> {
  return createNode("lib.http.DownloadFiles", inputs as Record<string, unknown>, { multiOutput: true });
}

// POST JSON — lib.http.JSONPostRequest
export interface JSONPostRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
}

export function jSONPostRequest(inputs: JSONPostRequestInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.http.JSONPostRequest", inputs as Record<string, unknown>);
}

// PUT JSON — lib.http.JSONPutRequest
export interface JSONPutRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
}

export function jSONPutRequest(inputs: JSONPutRequestInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.http.JSONPutRequest", inputs as Record<string, unknown>);
}

// PATCH JSON — lib.http.JSONPatchRequest
export interface JSONPatchRequestInputs {
  url?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
}

export function jSONPatchRequest(inputs: JSONPatchRequestInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.http.JSONPatchRequest", inputs as Record<string, unknown>);
}

// GET JSON — lib.http.JSONGetRequest
export interface JSONGetRequestInputs {
  url?: Connectable<string>;
}

export function jSONGetRequest(inputs: JSONGetRequestInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.http.JSONGetRequest", inputs as Record<string, unknown>);
}
