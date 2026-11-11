import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Asset, initMigratedDb, closeDb } from '@nodetool-ai/models';
import { ProcessingContext } from '@nodetool-ai/runtime';
import { FileStorageAdapter } from '@nodetool-ai/storage';
import { documentModelInterfaces } from '@nodetool-ai/document-services';
import { timelineProcessFixture } from './timeline-process-fixture.mjs';
const root = await mkdtemp(join(tmpdir(), 'gr-timeline-reference-'));
const assetRoot = join(root, 'assets');
await mkdir(assetRoot);
process.env.ASSET_FOLDER = assetRoot;
process.env.NODETOOL_STORAGE_BACKEND = 'file';
try {
  await initMigratedDb(join(root, 'timeline.sqlite'));
  const { createAssetModelInterface } = await import('@nodetool-ai/asset-services');
  const context = new ProcessingContext({ userId: 'alice', jobId: 'timeline', inheritHostDefaults: false,
    assetStorage: new FileStorageAdapter(assetRoot), modelInterfaces: { ...documentModelInterfaces(), createAsset: createAssetModelInterface,
      getAssetInfo: async ({ userId, assetId }) => { const asset = await Asset.find(userId, assetId); return asset && { id: asset.id, name: asset.name, content_type: asset.content_type, metadata: asset.metadata }; } } });
  console.log('timeline: ' + JSON.stringify(await timelineProcessFixture(context)));
} finally { await closeDb(); await rm(root, { recursive: true, force: true }); }
