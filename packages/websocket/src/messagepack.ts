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

/**
 * Decode a binary WebSocket frame. The caller names the frame type it expects
 * — only it knows which command or event the socket is carrying.
 */
export function unpackWebSocketMessage<TFrame>(value: Uint8Array): TFrame {
  return unpack(value);
}
