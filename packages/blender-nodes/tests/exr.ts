/**
 * Minimal OpenEXR reader for the `render_passes` EXR test.
 *
 * Mirrors `blender_ops/exr.py`: single-part scanline, `NO_COMPRESSION`,
 * `FLOAT` channels, one chunk per scanline. Refuses anything else rather
 * than guessing.
 */

export interface ExrFloatImage {
  width: number;
  height: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

function readCString(bytes: Uint8Array, pos: number): [string, number] {
  const end = bytes.indexOf(0, pos);
  if (end === -1) throw new Error("EXR has an unterminated string.");
  return [
    new TextDecoder().decode(bytes.subarray(pos, end)),
    end + 1
  ];
}

export function decodeExrFloat(bytes: Uint8Array): ExrFloatImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes[0] !== 0x76 ||
    bytes[1] !== 0x2f ||
    bytes[2] !== 0x31 ||
    bytes[3] !== 0x01
  ) {
    throw new Error("Not an EXR file: bad magic.");
  }
  const version = view.getUint32(4, true);
  if (version & 0x200) throw new Error("Tiled EXR is not supported.");
  if (version & 0x800) throw new Error("Multipart EXR is not supported.");
  if (version & 0x400) throw new Error("Long-name EXR is not supported.");
  let pos = 8;
  const attrs = new Map<string, Uint8Array>();
  for (;;) {
    const [name, afterName] = readCString(bytes, pos);
    pos = afterName;
    if (name === "") break;
    const [, afterType] = readCString(bytes, pos);
    pos = afterType;
    const size = view.getInt32(pos, true);
    pos += 4;
    attrs.set(name, bytes.subarray(pos, pos + size));
    pos += size;
  }
  if (attrs.get("compression")?.[0] !== 0) {
    throw new Error("Compressed EXR is not supported.");
  }
  const window = attrs.get("dataWindow");
  if (!window) throw new Error("EXR has no data window.");
  const windowView = new DataView(
    window.buffer,
    window.byteOffset,
    window.byteLength
  );
  const x0 = windowView.getInt32(0, true);
  const y0 = windowView.getInt32(4, true);
  const x1 = windowView.getInt32(8, true);
  const y1 = windowView.getInt32(12, true);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;

  const rawChannels = attrs.get("channels");
  if (!rawChannels) throw new Error("EXR has no channel list.");
  const channels: Array<{ name: string; pixelType: number }> = [];
  let channelPos = 0;
  for (;;) {
    const [name, afterName] = readCString(rawChannels, channelPos);
    channelPos = afterName;
    if (name === "") break;
    const channelView = new DataView(
      rawChannels.buffer,
      rawChannels.byteOffset + channelPos,
      16
    );
    const pixelType = channelView.getInt32(0, true);
    const xSampling = channelView.getInt32(8, true);
    const ySampling = channelView.getInt32(12, true);
    if (xSampling !== 1 || ySampling !== 1) {
      throw new Error("Subsampled EXR channels are not supported.");
    }
    if (pixelType !== 2) {
      throw new Error("Non-float EXR channel is not supported.");
    }
    channels.push({ name, pixelType });
    channelPos += 16;
  }

  const found = new Map<string, number[]>();
  for (let row = 0; row < height; row++) {
    const offset = Number(view.getBigInt64(pos + row * 8, true));
    const y = view.getInt32(offset, true);
    if (y !== y0 + row) throw new Error(`Scanline ${row} is out of order.`);
    const size = view.getInt32(offset + 4, true);
    let cursor = offset + 8;
    for (const channel of channels) {
      const count = width * 4;
      const values: number[] = [];
      for (let i = 0; i < width; i++) {
        values.push(view.getFloat32(cursor + i * 4, true));
      }
      found.set(
        channel.name,
        (found.get(channel.name) ?? []).concat(values)
      );
      cursor += count;
    }
    if (cursor !== offset + 8 + size) {
      throw new Error(`Scanline ${row} size mismatch.`);
    }
  }

  const channel = (suffix: string): Float32Array => {
    for (const [name, values] of found) {
      if (name === suffix || name.endsWith(`.${suffix}`)) {
        return new Float32Array(values);
      }
    }
    throw new Error(`EXR has no .${suffix} channel.`);
  };
  return { width, height, r: channel("R"), g: channel("G"), b: channel("B") };
}
