export {
  S3Client,
  S3Error,
  type S3Api,
  type S3ClientOptions,
  type S3ObjectRef,
  type S3PutObjectInput,
  type S3PutObjectResult,
  type S3GetObjectResult,
  type S3HeadObjectResult,
  type S3CopyObjectInput,
  type S3ListObjectsV2Input,
  type S3ListObjectsV2Result,
  type S3ObjectSummary,
  type S3BucketSummary,
  type S3PresignGetObjectInput
} from "./client.js";
export {
  signRequest,
  presignUrl,
  encodeS3Path,
  encodeRfc3986,
  canonicalQueryString,
  sha256Hex,
  signingKey,
  toAmzDate,
  EMPTY_PAYLOAD_SHA256,
  UNSIGNED_PAYLOAD,
  type SigV4Credentials,
  type SignRequestInput,
  type SignedRequest,
  type PresignUrlInput
} from "./signer.js";
