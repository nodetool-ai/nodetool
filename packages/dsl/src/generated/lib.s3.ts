// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// S3 List Buckets — lib.s3.ListBuckets
export interface ListBucketsInputs {
  region?: Connectable<string>;
}

export interface ListBucketsOutputs {
  output: unknown[];
}

export function listBuckets(inputs: ListBucketsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ListBucketsOutputs, "output"> {
  return createNode("lib.s3.ListBuckets", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// S3 List Objects — lib.s3.ListObjects
export interface ListObjectsInputs {
  bucket?: Connectable<string>;
  prefix?: Connectable<string>;
  max_keys?: Connectable<number>;
  region?: Connectable<string>;
}

export interface ListObjectsOutputs {
  object: Record<string, unknown>;
  objects: unknown[];
}

export function listObjects(inputs: ListObjectsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ListObjectsOutputs> {
  return createNode("lib.s3.ListObjects", inputs as Record<string, unknown>, { outputNames: ["object", "objects"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// S3 Get Object — lib.s3.GetObject
export interface GetObjectInputs {
  bucket?: Connectable<string>;
  key?: Connectable<string>;
  region?: Connectable<string>;
}

export interface GetObjectOutputs {
  output: string;
  content_type: string;
  size: number;
}

export function getObject(inputs: GetObjectInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetObjectOutputs> {
  return createNode("lib.s3.GetObject", inputs as Record<string, unknown>, { outputNames: ["output", "content_type", "size"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// S3 Put Object — lib.s3.PutObject
export interface PutObjectInputs {
  bucket?: Connectable<string>;
  key?: Connectable<string>;
  body?: Connectable<string>;
  content_type?: Connectable<string>;
  region?: Connectable<string>;
}

export interface PutObjectOutputs {
  output: boolean;
  etag: string;
}

export function putObject(inputs: PutObjectInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PutObjectOutputs> {
  return createNode("lib.s3.PutObject", inputs as Record<string, unknown>, { outputNames: ["output", "etag"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// S3 Delete Object — lib.s3.DeleteObject
export interface DeleteObjectInputs {
  bucket?: Connectable<string>;
  key?: Connectable<string>;
  region?: Connectable<string>;
}

export interface DeleteObjectOutputs {
  output: boolean;
}

export function deleteObject(inputs: DeleteObjectInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DeleteObjectOutputs, "output"> {
  return createNode("lib.s3.DeleteObject", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// S3 Copy Object — lib.s3.CopyObject
export interface CopyObjectInputs {
  source_bucket?: Connectable<string>;
  source_key?: Connectable<string>;
  dest_bucket?: Connectable<string>;
  dest_key?: Connectable<string>;
  region?: Connectable<string>;
}

export interface CopyObjectOutputs {
  output: boolean;
}

export function copyObject(inputs: CopyObjectInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CopyObjectOutputs, "output"> {
  return createNode("lib.s3.CopyObject", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// S3 Get Presigned URL — lib.s3.GetPresignedUrl
export interface GetPresignedUrlInputs {
  bucket?: Connectable<string>;
  key?: Connectable<string>;
  expires_in?: Connectable<number>;
  region?: Connectable<string>;
}

export interface GetPresignedUrlOutputs {
  output: string;
}

export function getPresignedUrl(inputs: GetPresignedUrlInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetPresignedUrlOutputs, "output"> {
  return createNode("lib.s3.GetPresignedUrl", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
