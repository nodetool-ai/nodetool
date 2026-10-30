import { pack, unpack } from 'msgpackr';
let buffer = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4 && buffer.length >= buffer.readUInt32BE(0) + 4) {
    const size = buffer.readUInt32BE(0);
    const request = unpack(buffer.subarray(4, size + 4));
    buffer = buffer.subarray(size + 4);
    if (request.operation === 'hang' || request.operation === 'cancel') continue;
    if (request.operation === 'exit') process.exit(2);
    if (request.operation === 'oversize') {
      const header = Buffer.alloc(4); header.writeUInt32BE(2048); process.stdout.write(header); continue;
    }
    const response = request.operation === 'script-error'
      ? { protocolVersion: 1, requestId: request.requestId, status: 'error', error: { code: 'script_error', message: 'Invalid command', path: '/scripts/0', details: { entityId: 'player', behaviorId: 'move', sourceDigest: 'digest', hook: 'onUpdate', tick: 42, limit: 'commands' } } }
      : request.operation === 'invalid'
      ? { protocolVersion: 1, requestId: request.requestId, status: 'error', error: { code: 'validation', message: 'Invalid document' } }
      : { protocolVersion: 1, requestId: request.requestId, status: 'ok', result: { engine: 'native-cpp-1' } };
    const payload = pack(response); const header = Buffer.alloc(4); header.writeUInt32BE(payload.length);
    const frame = Buffer.concat([header, payload]);
    process.stdout.write(frame.subarray(0, 2));
    setTimeout(() => process.stdout.write(frame.subarray(2)), 1);
  }
});
