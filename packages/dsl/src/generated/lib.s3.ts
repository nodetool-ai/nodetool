// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// S3 List Buckets — lib.s3.ListBuckets
export interface ListBucketsInputs {
  region?: Connectable<string>;
}

export interface ListBucketsOutputs {
  output: unknown[];
}

export function listBuckets(inputs: ListBucketsInputs): DslNode<ListBucketsOutputs, "output"> {
  return createNode("lib.s3.ListBuckets", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function listObjects(inputs: ListObjectsInputs): DslNode<ListObjectsOutputs> {
  return createNode("lib.s3.ListObjects", inputs as Record<string, unknown>, { outputNames: ["object", "objects"], streaming: true });
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

export function getObject(inputs: GetObjectInputs): DslNode<GetObjectOutputs> {
  return createNode("lib.s3.GetObject", inputs as Record<string, unknown>, { outputNames: ["output", "content_type", "size"] });
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

export function putObject(inputs: PutObjectInputs): DslNode<PutObjectOutputs> {
  return createNode("lib.s3.PutObject", inputs as Record<string, unknown>, { outputNames: ["output", "etag"] });
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

export function deleteObject(inputs: DeleteObjectInputs): DslNode<DeleteObjectOutputs, "output"> {
  return createNode("lib.s3.DeleteObject", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function copyObject(inputs: CopyObjectInputs): DslNode<CopyObjectOutputs, "output"> {
  return createNode("lib.s3.CopyObject", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function getPresignedUrl(inputs: GetPresignedUrlInputs): DslNode<GetPresignedUrlOutputs, "output"> {
  return createNode("lib.s3.GetPresignedUrl", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
