"""Exercise actual framed worker process without external Python packages."""
import struct
import subprocess
import sys


def pack(value):
    if isinstance(value, bool):
        return b'\xc3' if value else b'\xc2'
    if isinstance(value, int):
        return b'\xce' + struct.pack('>I', value)
    if isinstance(value, str):
        data = value.encode()
        return b'\xda' + struct.pack('>H', len(data)) + data
    if isinstance(value, list):
        return b'\xdc' + struct.pack('>H', len(value)) + b''.join(pack(x) for x in value)
    if isinstance(value, dict):
        return b'\xde' + struct.pack('>H', len(value)) + b''.join(pack(k) + pack(v) for k, v in value.items())
    raise TypeError(value)


def frame(value):
    data = pack(value)
    return struct.pack('>I', len(data)) + data


def run(data):
    return subprocess.run([sys.argv[1]], input=data, capture_output=True, timeout=30)


hello = {'protocolVersion': 1, 'requestId': 'hello', 'operation': 'hello'}
result = run(frame(hello) + frame(hello))
assert result.returncode == 0, result.stderr
length = struct.unpack('>I', result.stdout[:4])[0]
first = result.stdout[:length + 4]
assert first == result.stdout[length + 4:], 'Retry response changed'
assert b'native-cpp-1' in first and b'capabilities' in first
assert run(b'\x00\x00').returncode != 0, 'Truncated header succeeded'
assert run(struct.pack('>I', 32 * 1024 * 1024)).returncode != 0, 'Oversized frame succeeded'
assert run(struct.pack('>I', 10) + b'x').returncode != 0, 'Truncated payload succeeded'
invalid = run(struct.pack('>I', 1) + b'\xc1')
assert invalid.returncode == 0 and b'protocol_error' in invalid.stdout, 'Malformed MsgPack not reported'
print('Worker framing, retry, malformed and oversized messages passed')


def decode(data, offset=0):
    code = data[offset]
    offset += 1
    if code <= 0x7f:
        return code, offset
    if 0xa0 <= code <= 0xbf:
        size = code & 31
        return data[offset:offset + size].decode(), offset + size
    if 0x80 <= code <= 0x8f:
        count, result = code & 15, {}
        for _ in range(count):
            key, offset = decode(data, offset)
            result[key], offset = decode(data, offset)
        return result, offset
    if 0x90 <= code <= 0x9f:
        count, result = code & 15, []
        for _ in range(count):
            value, offset = decode(data, offset)
            result.append(value)
        return result, offset
    if code in (0xc0, 0xc2, 0xc3):
        return {0xc0: None, 0xc2: False, 0xc3: True}[code], offset
    formats = {0xcc: '>B', 0xcd: '>H', 0xce: '>I', 0xcf: '>Q', 0xd0: '>b', 0xd1: '>h', 0xd2: '>i', 0xd3: '>q', 0xca: '>f', 0xcb: '>d'}
    if code in formats:
        fmt = formats[code]
        size = struct.calcsize(fmt)
        return struct.unpack(fmt, data[offset:offset + size])[0], offset + size
    if code in (0xd9, 0xda, 0xdb):
        fmt = {0xd9: '>B', 0xda: '>H', 0xdb: '>I'}[code]
        size = struct.calcsize(fmt)
        length = struct.unpack(fmt, data[offset:offset + size])[0]
        offset += size
        return data[offset:offset + length].decode(), offset + length
    if code in (0xdc, 0xdd, 0xde, 0xdf):
        fmt = '>H' if code in (0xdc, 0xde) else '>I'
        size = struct.calcsize(fmt)
        count = struct.unpack(fmt, data[offset:offset + size])[0]
        offset += size
        result = {} if code in (0xde, 0xdf) else []
        for _ in range(count):
            value, offset = decode(data, offset)
            if isinstance(result, dict):
                result[value], offset = decode(data, offset)
            else:
                result.append(value)
        return result, offset
    raise ValueError(hex(code))


process = subprocess.Popen([sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def request(request_id, operation, **values):
    process.stdin.write(frame({'protocolVersion': 1, 'requestId': request_id, 'operation': operation, **values}))
    process.stdin.flush()
    header = process.stdout.read(4)
    assert len(header) == 4, 'Worker exited before response'
    size = struct.unpack('>I', header)[0]
    payload = process.stdout.read(size)
    value, consumed = decode(payload)
    assert consumed == size
    return value


document = {'schemaVersion': 4, 'engine': 'native-cpp-1', 'dimension': '3d', 'id': 'test', 'title': 'Test', 'initialSceneId': 'main', 'scenes': [{'id': 'main'}]}
opened = request('open', 'open', sessionId='session', document=document)
assert opened['status'] == 'ok' and opened['result']['revision'] == 0
edited = request('edit', 'transaction', sessionId='session', expectedRevision=0, operations=[{'kind': 'setTitle', 'title': 'Changed'}])
assert edited['status'] == 'ok' and edited['result']['revision'] == 1
retry = request('edit', 'transaction', sessionId='session', expectedRevision=0, operations=[{'kind': 'setTitle', 'title': 'Changed'}])
assert retry == edited
conflict = request('stale', 'transaction', sessionId='session', expectedRevision=0, operations=[{'kind': 'setTitle', 'title': 'Wrong'}])
assert conflict['error']['code'] == 'conflict' and conflict['error']['currentRevision'] == 1
undone = request('undo', 'undo', sessionId='session', expectedRevision=1)
assert undone['result']['document']['title'] == 'Test' and undone['result']['revision'] == 2
redone = request('redo', 'redo', sessionId='session', expectedRevision=2)
assert redone['result']['document']['title'] == 'Changed' and redone['result']['revision'] == 3
unknown = request('unknown', 'step', sessionId='session')
assert unknown['error']['code'] == 'unavailable_capability'
assert request('close', 'close', sessionId='session')['result']['closed']
process.stdin.close()
assert process.wait(timeout=10) == 0
print('Worker open, transaction, retry, conflict, history and capability checks passed')
