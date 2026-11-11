import { SaveImageNode } from '@nodetool-ai/image-nodes/nodes/image';
// A fixed PNG, shared verbatim by the QuickJS and TypeScript executions.
export const PNG = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,8,153,99,248,207,192,240,31,0,5,0,1,255,171,206,54,137,0,0,0,0,73,69,78,68,174,66,96,130];
export async function modelNodeFixture(context) {
  const node = new SaveImageNode();
  node.name = 'fixture.png';
  node.folder = { type: 'folder', asset_id: null };
  node.image = { type: 'image', data: new Uint8Array(PNG) };
  const { output } = await node.process(context);
  if (!/^asset:\/\/[0-9a-f]{32}\.png$/.test(output.uri)) throw new Error('SaveImage did not persist a full asset ID');
  const asset = await context.getAssetInfo(output.uri.slice('asset://'.length).replace(/\.png$/, ''));
  if (!asset) throw new Error('Saved image has no metadata row');
  const resolved = await context.resolveAssetBytes(output.uri);
  const bytes = resolved?.bytes ?? resolved;
  if (!bytes || bytes.length !== PNG.length || bytes.some((v, i) => v !== PNG[i])) throw new Error('Saved image bytes changed');
  return { node: node.constructor.nodeType, name: asset.name, content_type: asset.content_type,
    width: output.width, height: output.height, byteLength: bytes.length, hasLocalPath: !!(await context.localPath(output.uri)) };
}
