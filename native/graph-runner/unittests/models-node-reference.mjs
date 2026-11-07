import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Asset, Project, initMigratedDb, closeDb } from '@nodetool-ai/models';
import { ProcessingContext } from '@nodetool-ai/runtime';
import { FileStorageAdapter } from '@nodetool-ai/storage';
import sharp from 'sharp';
import { documentModelInterfaces } from '@nodetool-ai/document-services';
import { documentContractFixture } from './models-documents-fixture.mjs';
import { modelNodeFixture } from './models-node-fixture.mjs';
const root = await mkdtemp(join(tmpdir(), 'gr-model-reference-'));
const assetRoot = join(root, 'assets');
await mkdir(assetRoot);
// Configure this isolated reference process before the production asset adapter loads.
process.env.ASSET_FOLDER = assetRoot;
process.env.NODETOOL_STORAGE_BACKEND = 'file';
try {
  await initMigratedDb(join(root, 'models.sqlite'));
  const { createAssetModelInterface } = await import('@nodetool-ai/asset-services');
  const context = new ProcessingContext({ userId: 'alice', jobId: 'fixture', inheritHostDefaults: false,
    assetStorage: new FileStorageAdapter(assetRoot), modelInterfaces: {
      ...documentModelInterfaces(),
      createAsset: createAssetModelInterface,
      getAssetInfo: async ({ userId, assetId }) => {
        const asset = await Asset.find(userId, assetId);
        return asset && { id: asset.id, name: asset.name, content_type: asset.content_type, metadata: asset.metadata };
      }
    } });
  console.log(`parity: ${JSON.stringify(await modelNodeFixture(context))}`);
  const foreign = new ProcessingContext({ userId: 'bob', jobId: 'foreign', inheritHostDefaults: false, modelInterfaces: documentModelInterfaces() });
  console.log(`documents: ${JSON.stringify((await documentContractFixture(context, foreign, { decodeImage: async (bytes) => { const {data, info} = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}); return {rgba:data,width:info.width,height:info.height}; }, createProject: (userId, id, deleted_at) => Project.create({ user_id: userId, id, name: id, deleted_at }) })).result)}`);
} finally {
  await closeDb();
  await rm(root, { recursive: true, force: true });
}
