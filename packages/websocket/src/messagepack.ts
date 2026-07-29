import { Packr, unpack } from "msgpackr";

// Keep binary WebSocket frames interoperable with non-JavaScript MessagePack
// implementations. msgpackr otherwise encodes `undefined` using its private
// extension type 0x00, which clients such as MessagePack-CSharp reject.
const websocketPackr = new Packr({
  useRecords: false,
  encodeUndefinedAsNil: true
});

export function packWebSocketMessage(value: unknown): Buffer {
  return websocketPackr.pack(value);
}

export function unpackWebSocketMessage(value: Uint8Array): unknown {
  return unpack(value);
}
