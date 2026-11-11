// EntityLibrary against a real scratch server: the tRPC schemas, the
// expected_metadata comparison and project filing that the fake in
// tst_entitylibrary only assumes. Skips with 77 when no server can start.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createScratchSession } from '../../scripts/scratch-server.mjs';

const native = fileURLToPath(new URL('../../', import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-entities-'));
const session = createScratchSession({ work, repo: path.resolve(native, '../..'), assertInWork: candidate => {
  if (!candidate.startsWith(work + path.sep)) { throw new Error('outside scratch folder'); }
  return candidate;
} });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');
let passed = false;
try {
  let server;
  try {
    server = await session.startServer('entities', 18000 + (process.pid % 20000));
  } catch (error) {
    console.log(`SKIP: scratch server unavailable: ${error.message}`);
    if (process.env.NT_REQUIRE_SCRATCH_SERVER === '1') { throw error; }
    process.exitCode = 77;
  }
  if (server) {
    await session.assertScratch(server.base);
    const file = path.join(work, 'picture.png');
    fs.writeFileSync(file, png);
    const first = await session.upload(server, file, 'image/png');
    const second = await session.upload(server, file, 'image/png');
    const third = await session.upload(server, file, 'image/png');
    const project = await session.mutate(server.base, 'projects.create', { name: 'Entities' });
    await session.mutate(server.base, 'assets.update', { id: first.id, metadata: { keep: 1 } });
    await session.mutate(server.base, 'assets.update', { id: third.id, metadata: { nodetool_entity: { kind: 'prop', name: 'Web entity', descriptor: 'Web image', tags: ['web'] } } });
    await session.mutate(server.base, 'projects.assignDocument', { projectId: project.id, type: 'entity', ref: third.id });
    const uploadReport = path.join(work, 'uploaded-id');
    const { stdout } = await promisify(execFile)(process.argv[2], ['realServer'], {
      env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', NT_ENTITY_SERVER: server.base, NT_ENTITY_PROJECT: project.id,
        NT_ENTITY_PNG: file, NT_ENTITY_UPLOAD_REPORT: uploadReport, NT_ENTITY_FIRST: first.id, NT_ENTITY_SECOND: second.id, NT_ENTITY_THIRD: third.id },
      timeout: 120000
    });
    console.log(stdout.trimEnd());
    assert.match(stdout, /PASS {3}: EntityLibraryTest::realServer\(\)/, stdout);
    const uploaded = await session.query(server.base, 'assets.get', { id: fs.readFileSync(uploadReport, 'utf8') });
    assert.equal(uploaded.project_id, project.id, 'uploadImages files the image under project_id');
    assert.equal(uploaded.content_type, 'image/png');
    const final = await session.query(server.base, 'assets.get', { id: first.id });
    assert.equal(final.project_id, project.id, 'a created entity is filed under the project');
    assert.equal(final.metadata.keep, 1, 'unrelated metadata survives');
    assert.equal(final.metadata.nodetool_entity.name, 'Mara');
    assert.equal(final.metadata.nodetool_entity.reference_asset_id, second.id);
    assert.equal(final.metadata.nodetool_entity.lora.id, 'kept');
    const web = await session.query(server.base, 'assets.get', { id: third.id });
    assert.equal(web.metadata.nodetool_entity, undefined, 'web-created entity was removed');
    console.log('PASS: EntityLibrary upload, create, edit, remove and undo on a real server');
    console.log('Totals: 1 passed, 0 failed, 0 skipped');
    passed = true;
  }
} finally {
  await session.stopServers();
  if (passed) { fs.rmSync(work, { recursive: true, force: true }); }
}
