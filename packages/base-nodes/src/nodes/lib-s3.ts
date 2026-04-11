import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getS3Client(
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<any> {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function getAwsCredentials(secrets: Record<string, string>): {
  accessKeyId: string;
  secretAccessKey: string;
} {
  const accessKeyId = secrets.AWS_ACCESS_KEY_ID || "";
  const secretAccessKey = secrets.AWS_SECRET_ACCESS_KEY || "";
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS credentials are required. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in secrets."
    );
  }
  return { accessKeyId, secretAccessKey };
}

// ---------------------------------------------------------------------------
// ListBuckets
// ---------------------------------------------------------------------------

export class S3ListBucketsLibNode extends BaseNode {
  static readonly nodeType = "lib.s3.ListBuckets";
  static readonly title = "S3 List Buckets";
  static readonly description =
    "Lists all S3 buckets in the AWS account.\n    aws, s3, buckets, list, cloud, storage";
  static readonly metadataOutputTypes = {
    output: "list"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY"
  ];

  @prop({
    type: "str",
    default: "us-east-1",
    title: "Region",
    description: "AWS region"
  })
  declare region: any;

  async process(): Promise<Record<string, unknown>> {
    const { accessKeyId, secretAccessKey } = getAwsCredentials(this._secrets);
    const region = String(this.region ?? "us-east-1");
    const client = await getS3Client(region, accessKeyId, secretAccessKey);
    const { ListBucketsCommand } = await import("@aws-sdk/client-s3");
    const response = await client.send(new ListBucketsCommand({}));
    const buckets = (response.Buckets ?? []).map((b: Record<string, unknown>) => ({
      name: (b.Name as string) ?? "",
      creation_date: (b.CreationDate as Date)?.toISOString() ?? ""
    }));
    return { output: buckets };
  }
}

// ---------------------------------------------------------------------------
// ListObjects
// ---------------------------------------------------------------------------

export class S3ListObjectsLibNode extends BaseNode {
  static readonly nodeType = "lib.s3.ListObjects";
  static readonly title = "S3 List Objects";
  static readonly description =
    "Lists objects in an S3 bucket with optional prefix filter.\n    aws, s3, objects, list, cloud, storage, browse";
  static readonly metadataOutputTypes = {
    object: "dict",
    objects: "list"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY"
  ];
  static readonly isStreamingOutput = true;

  @prop({
    type: "str",
    default: "",
    title: "Bucket",
    description: "S3 bucket name"
  })
  declare bucket: any;

  @prop({
    type: "str",
    default: "",
    title: "Prefix",
    description: "Optional key prefix to filter objects"
  })
  declare prefix: any;

  @prop({
    type: "int",
    default: 100,
    title: "Max Keys",
    description: "Maximum number of objects to return"
  })
  declare max_keys: any;

  @prop({
    type: "str",
    default: "us-east-1",
    title: "Region",
    description: "AWS region"
  })
  declare region: any;

  async process(): Promise<Record<string, unknown>> {
    const { accessKeyId, secretAccessKey } = getAwsCredentials(this._secrets);
    const bucket = String(this.bucket ?? "");
    if (!bucket) throw new Error("Bucket name is required");
    const prefix = String(this.prefix ?? "");
    const maxKeys = Number(this.max_keys ?? 100);
    const region = String(this.region ?? "us-east-1");

    const client = await getS3Client(region, accessKeyId, secretAccessKey);
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        MaxKeys: maxKeys
      })
    );
    const objects = (response.Contents ?? []).map((obj: Record<string, unknown>) => ({
      key: (obj.Key as string) ?? "",
      size: (obj.Size as number) ?? 0,
      last_modified: (obj.LastModified as Date)?.toISOString() ?? "",
      etag: (obj.ETag as string) ?? "",
      storage_class: (obj.StorageClass as string) ?? ""
    }));
    return { object: objects[0] ?? {}, objects };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const { accessKeyId, secretAccessKey } = getAwsCredentials(this._secrets);
    const bucket = String(this.bucket ?? "");
    if (!bucket) throw new Error("Bucket name is required");
    const prefix = String(this.prefix ?? "");
    const maxKeys = Number(this.max_keys ?? 100);
    const region = String(this.region ?? "us-east-1");

    const client = await getS3Client(region, accessKeyId, secretAccessKey);
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        MaxKeys: maxKeys
      })
    );
    const objects = (response.Contents ?? []).map((obj: Record<string, unknown>) => ({
      key: (obj.Key as string) ?? "",
      size: (obj.Size as number) ?? 0,
      last_modified: (obj.LastModified as Date)?.toISOString() ?? "",
      etag: (obj.ETag as string) ?? "",
      storage_class: (obj.StorageClass as string) ?? ""
    }));

    for (const obj of objects) {
      yield { object: obj };
    }

    yield { objects };
  }
}

// ---------------------------------------------------------------------------
// GetObject
// ---------------------------------------------------------------------------

export class S3GetObjectLibNode extends BaseNode {
  static readonly nodeType = "lib.s3.GetObject";
  static readonly title = "S3 Get Object";
  static readonly description =
    "Downloads an object's content as text from S3.\n    aws, s3, get, download, read, cloud, storage";
  static readonly metadataOutputTypes = {
    output: "str",
    content_type: "str",
    size: "int"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY"
  ];

  @prop({
    type: "str",
    default: "",
    title: "Bucket",
    description: "S3 bucket name"
  })
  declare bucket: any;

  @prop({
    type: "str",
    default: "",
    title: "Key",
    description: "Object key (path) in the bucket"
  })
  declare key: any;

  @prop({
    type: "str",
    default: "us-east-1",
    title: "Region",
    description: "AWS region"
  })
  declare region: any;

  async process(): Promise<Record<string, unknown>> {
    const { accessKeyId, secretAccessKey } = getAwsCredentials(this._secrets);
    const bucket = String(this.bucket ?? "");
    const key = String(this.key ?? "");
    if (!bucket) throw new Error("Bucket name is required");
    if (!key) throw new Error("Object key is required");
    const region = String(this.region ?? "us-east-1");

    const client = await getS3Client(region, accessKeyId, secretAccessKey);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const body = await response.Body?.transformToString();
    return {
      output: body ?? "",
      content_type: response.ContentType ?? "",
      size: response.ContentLength ?? 0
    };
  }
}

// ---------------------------------------------------------------------------
// PutObject
// ---------------------------------------------------------------------------

export class S3PutObjectLibNode extends BaseNode {
  static readonly nodeType = "lib.s3.PutObject";
  static readonly title = "S3 Put Object";
  static readonly description =
    "Uploads text content to an S3 object.\n    aws, s3, put, upload, write, cloud, storage";
  static readonly metadataOutputTypes = {
    output: "bool",
    etag: "str"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY"
  ];

  @prop({
    type: "str",
    default: "",
    title: "Bucket",
    description: "S3 bucket name"
  })
  declare bucket: any;

  @prop({
    type: "str",
    default: "",
    title: "Key",
    description: "Object key (path) in the bucket"
  })
  declare key: any;

  @prop({
    type: "str",
    default: "",
    title: "Body",
    description: "Text content to upload"
  })
  declare body: any;

  @prop({
    type: "str",
    default: "text/plain",
    title: "Content Type",
    description: "MIME type of the content"
  })
  declare content_type: any;

  @prop({
    type: "str",
    default: "us-east-1",
    title: "Region",
    description: "AWS region"
  })
  declare region: any;

  async process(): Promise<Record<string, unknown>> {
    const { accessKeyId, secretAccessKey } = getAwsCredentials(this._secrets);
    const bucket = String(this.bucket ?? "");
    const key = String(this.key ?? "");
    if (!bucket) throw new Error("Bucket name is required");
    if (!key) throw new Error("Object key is required");
    const bodyContent = String(this.body ?? "");
    const contentType = String(this.content_type ?? "text/plain");
    const region = String(this.region ?? "us-east-1");

    const client = await getS3Client(region, accessKeyId, secretAccessKey);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const response = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bodyContent,
        ContentType: contentType
      })
    );
    return {
      output: true,
      etag: response.ETag ?? ""
    };
  }
}

// ---------------------------------------------------------------------------
// DeleteObject
// ---------------------------------------------------------------------------

export class S3DeleteObjectLibNode extends BaseNode {
  static readonly nodeType = "lib.s3.DeleteObject";
  static readonly title = "S3 Delete Object";
  static readonly description =
    "Deletes an object from an S3 bucket.\n    aws, s3, delete, remove, cloud, storage";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY"
  ];

  @prop({
    type: "str",
    default: "",
    title: "Bucket",
    description: "S3 bucket name"
  })
  declare bucket: any;

  @prop({
    type: "str",
    default: "",
    title: "Key",
    description: "Object key (path) to delete"
  })
  declare key: any;

  @prop({
    type: "str",
    default: "us-east-1",
    title: "Region",
    description: "AWS region"
  })
  declare region: any;

  async process(): Promise<Record<string, unknown>> {
    const { accessKeyId, secretAccessKey } = getAwsCredentials(this._secrets);
    const bucket = String(this.bucket ?? "");
    const key = String(this.key ?? "");
    if (!bucket) throw new Error("Bucket name is required");
    if (!key) throw new Error("Object key is required");
    const region = String(this.region ?? "us-east-1");

    const client = await getS3Client(region, accessKeyId, secretAccessKey);
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key })
    );
    return { output: true };
  }
}

// ---------------------------------------------------------------------------
// CopyObject
// ---------------------------------------------------------------------------

export class S3CopyObjectLibNode extends BaseNode {
  static readonly nodeType = "lib.s3.CopyObject";
  static readonly title = "S3 Copy Object";
  static readonly description =
    "Copies an object within or between S3 buckets.\n    aws, s3, copy, duplicate, cloud, storage";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY"
  ];

  @prop({
    type: "str",
    default: "",
    title: "Source Bucket",
    description: "Source S3 bucket name"
  })
  declare source_bucket: any;

  @prop({
    type: "str",
    default: "",
    title: "Source Key",
    description: "Source object key (path)"
  })
  declare source_key: any;

  @prop({
    type: "str",
    default: "",
    title: "Destination Bucket",
    description: "Destination S3 bucket name"
  })
  declare dest_bucket: any;

  @prop({
    type: "str",
    default: "",
    title: "Destination Key",
    description: "Destination object key (path)"
  })
  declare dest_key: any;

  @prop({
    type: "str",
    default: "us-east-1",
    title: "Region",
    description: "AWS region"
  })
  declare region: any;

  async process(): Promise<Record<string, unknown>> {
    const { accessKeyId, secretAccessKey } = getAwsCredentials(this._secrets);
    const sourceBucket = String(this.source_bucket ?? "");
    const sourceKey = String(this.source_key ?? "");
    const destBucket = String(this.dest_bucket ?? "");
    const destKey = String(this.dest_key ?? "");
    if (!sourceBucket) throw new Error("Source bucket name is required");
    if (!sourceKey) throw new Error("Source object key is required");
    if (!destBucket) throw new Error("Destination bucket name is required");
    if (!destKey) throw new Error("Destination object key is required");
    const region = String(this.region ?? "us-east-1");

    const client = await getS3Client(region, accessKeyId, secretAccessKey);
    const { CopyObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(
      new CopyObjectCommand({
        Bucket: destBucket,
        Key: destKey,
        CopySource: `${sourceBucket}/${sourceKey}`
      })
    );
    return { output: true };
  }
}

// ---------------------------------------------------------------------------
// GetPresignedUrl
// ---------------------------------------------------------------------------

export class S3GetPresignedUrlLibNode extends BaseNode {
  static readonly nodeType = "lib.s3.GetPresignedUrl";
  static readonly title = "S3 Get Presigned URL";
  static readonly description =
    "Generates a presigned URL for temporary access to an S3 object.\n    aws, s3, presigned, url, share, cloud, storage\n\n    Note: Requires @aws-sdk/s3-request-presigner. If unavailable, falls back to constructing an unsigned URL.";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY"
  ];

  @prop({
    type: "str",
    default: "",
    title: "Bucket",
    description: "S3 bucket name"
  })
  declare bucket: any;

  @prop({
    type: "str",
    default: "",
    title: "Key",
    description: "Object key (path) in the bucket"
  })
  declare key: any;

  @prop({
    type: "int",
    default: 3600,
    title: "Expires In",
    description: "Expiry time in seconds"
  })
  declare expires_in: any;

  @prop({
    type: "str",
    default: "us-east-1",
    title: "Region",
    description: "AWS region"
  })
  declare region: any;

  async process(): Promise<Record<string, unknown>> {
    const { accessKeyId, secretAccessKey } = getAwsCredentials(this._secrets);
    const bucket = String(this.bucket ?? "");
    const key = String(this.key ?? "");
    if (!bucket) throw new Error("Bucket name is required");
    if (!key) throw new Error("Object key is required");
    const expiresIn = Number(this.expires_in ?? 3600);
    const region = String(this.region ?? "us-east-1");

    const client = await getS3Client(region, accessKeyId, secretAccessKey);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });

    try {
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const url = await getSignedUrl(client, command, { expiresIn });
      return { output: url };
    } catch {
      // Fallback: construct an unsigned S3 URL if presigner is not available
      const unsignedUrl = `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`;
      return { output: unsignedUrl };
    }
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const LIB_S3_NODES: readonly NodeClass[] = [
  S3ListBucketsLibNode,
  S3ListObjectsLibNode,
  S3GetObjectLibNode,
  S3PutObjectLibNode,
  S3DeleteObjectLibNode,
  S3CopyObjectLibNode,
  S3GetPresignedUrlLibNode
] as const;
