import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { createCoreExecutionHost } from "@nodetool-ai/nodes-core";
import { OpenAITextProvider, createLocalWorkspace, type TextProvider } from "@nodetool-ai/runtime-core";
import type { Repository } from "@nodetool-ai/models-core";
import { encrypt, decrypt } from "@nodetool-ai/security-core";
import { createServerCore } from "@nodetool-ai/server-core";
import { configureFeatures, type ConfiguredFeature, type FeatureDescriptor } from "@nodetool-ai/server-features";
import { ConfiguredTokenAuth } from "./auth.js";
import { OPTIONAL_FEATURE_CATALOG } from "./feature-catalog.js";

export { ConfiguredTokenAuth } from "./auth.js";

export interface MinimalAssetInfo {
  readonly id: string;
  readonly name: string;
  readonly content_type: string;
  readonly metadata: Record<string,unknown> | null;
  readonly uri: string;
}

export interface MinimalFeatureHost {
  readonly execution: ReturnType<typeof createCoreExecutionHost>;
  readonly readSecret: (userId: string, key: string) => Promise<string | undefined>;
  readonly readAsset: (userId: string, reference: unknown) => Promise<Uint8Array>;
  readonly getAssetInfo: (userId: string, reference: unknown) => Promise<MinimalAssetInfo>;
  readonly writeAsset: (userId: string, asset: {name:string;contentType:string;content:Uint8Array;metadata?:Record<string,unknown>|null}) => Promise<MinimalAssetInfo>;
}

export interface MinimalServerOptions {
  readonly directory: string;
  /** Transferred to this server: closed on startup failure and server shutdown. */
  readonly repository?: Repository;
  readonly masterKey: string;
  readonly tokens: Readonly<Record<string, string>>;
  readonly provider?: TextProvider | ((userId: string) => TextProvider | Promise<TextProvider>);
  readonly openAIBaseURL?: string;
  readonly features?: readonly ConfiguredFeature<MinimalFeatureHost>[];
  readonly featureCatalog?: readonly FeatureDescriptor[];
}

/** Compose SQLite, authenticated HTTP/MsgPack and explicitly installed features. */
export async function createMinimalServer(options: MinimalServerOptions): Promise<Awaited<ReturnType<typeof createServerCore>>> {
  let auth: ConfiguredTokenAuth;
  const directory = resolve(options.directory);
  try {
    if (options.masterKey.length < 32) {
      throw new Error("An explicit secrets master key of at least 32 characters is required");
    }
    auth = new ConfiguredTokenAuth(options.tokens);
    await mkdir(directory, { recursive: true });
  } catch (error) {
    await options.repository?.close();
    throw error;
  }
  const repository = options.repository ?? createSqliteRepository(join(directory, "nodetool.db"));
  try {
    const readSecret = async (userId: string, key: string): Promise<string | undefined> => {
      const secrets = await repository.list("secrets", userId);
      const secret = secrets.find((entry) => entry.key === key);
      return secret && typeof secret.encrypted_value === "string"
        ? decrypt(options.masterKey, userId, secret.encrypted_value)
        : undefined;
    };
    const execution = createCoreExecutionHost({
      workspace: async (userId, jobId) => {
        const userSegment = createHash("sha256").update(userId).digest("hex");
        const runSegment = createHash("sha256").update(jobId).digest("hex");
        const workspaceDirectory = join(directory, "workspaces", userSegment, runSegment);
        await mkdir(workspaceDirectory, { recursive: true });
        return createLocalWorkspace(workspaceDirectory);
      },
      provider: options.provider ?? (async (userId: string) => {
        const apiKey = await readSecret(userId, "OPENAI_API_KEY");
        if (!apiKey) {
          throw new Error("Configure OPENAI_API_KEY in the authenticated user's secrets");
        }
        return new OpenAITextProvider({
          apiKey,
          baseURL: options.openAIBaseURL
        });
      })
    });
    const getAssetInfo = async (userId: string, reference: unknown): Promise<MinimalAssetInfo> => {
      let id: unknown = reference;
      if (typeof reference === "object" && reference !== null) {
        id = "asset_id" in reference && typeof reference.asset_id === "string" && reference.asset_id.length > 0
          ? reference.asset_id
          : "uri" in reference ? reference.uri : undefined;
      }
      if (typeof id !== "string") {
        throw new Error("A persistent asset reference is required");
      }
      id = id.startsWith("asset://") ? id.slice(8) : id;
      if (typeof id !== "string") {
        throw new Error("Invalid asset reference");
      }
      const asset = await repository.get("assets", userId, id);
      if (!asset || typeof asset.id !== "string" || !/^[0-9a-f]{32}$/.test(asset.id)) {
        throw new Error("Asset not found");
      }
      const metadata = typeof asset.metadata === "object" && asset.metadata !== null && !Array.isArray(asset.metadata) ? Object.fromEntries(Object.entries(asset.metadata)) : null;
      return {id:asset.id,name:typeof asset.name === "string" ? asset.name : asset.id,content_type:typeof asset.content_type === "string" ? asset.content_type : "application/octet-stream",metadata,uri:`asset://${asset.id}`};
    };
    const readAsset = async (userId:string,reference:unknown):Promise<Uint8Array> => {
      const asset = await getAssetInfo(userId,reference);
      return new Uint8Array(await readFile(join(directory,"assets",asset.id)));
    };
    const writeAsset: MinimalFeatureHost["writeAsset"] = async (userId,asset) => {
      const id=randomBytes(16).toString("hex");
      const assetDirectory=join(directory,"assets");
      await mkdir(assetDirectory,{recursive:true});
      const file=join(assetDirectory,id);
      await writeFile(file,asset.content,{flag:"wx",mode:0o600});
      try {
        await repository.put("assets",userId,{id,name:asset.name,content_type:asset.contentType,size:asset.content.byteLength,metadata:asset.metadata ?? null});
      } catch(error) { await unlink(file); throw error; }
      return {id,name:asset.name,content_type:asset.contentType,metadata:asset.metadata ?? null,uri:`asset://${id}`};
    };
    const features = await configureFeatures(options.features ?? [], { execution, readAsset, readSecret, getAssetInfo, writeAsset }, options.featureCatalog ?? OPTIONAL_FEATURE_CATALOG);
    try {
      const app = await createServerCore({
        repository,
        auth,
        executor: {
          validate: (graph) => execution.validate(graph).map((issue) => {
            if (!issue.nodeType) {
              return issue;
            }
            try {
              features.requireNode(issue.nodeType);
              return issue;
            } catch (error) {
              if (error instanceof Error && "featureIds" in error) {
                return { ...issue, code: "code" in error && typeof error.code === "string" ? error.code : "FEATURE_NOT_INSTALLED", featureIds: error.featureIds, recovery: "recovery" in error ? error.recovery : undefined, message: error.message };
              }
              return issue;
            }
          }),
          run: (request) => execution.run({ ...request, emit: (event) => request.emit({ ...event }) })
        },
        assetDirectory: join(directory, "assets"),
        capabilities: ["workflows", "assets", "secrets", "execution", "remote-text", ...features.capabilities],
        secrets: {
          encrypt: (userId, value) => encrypt(options.masterKey, userId, value),
          decrypt: (userId, value) => decrypt(options.masterKey, userId, value)
        }
      });
      app.addHook("onClose", async () => {
        try {
          await features.close();
        } finally {
          await repository.close();
        }
      });
      return app;
    } catch (error) {
      await features.close();
      throw error;
    }
  } catch (error) {
    await repository.close();
    throw error;
  }
}

export { OPTIONAL_FEATURE_CATALOG } from "./feature-catalog.js";
