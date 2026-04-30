import type { RealtimeFrame } from "@nodetool/protocol";
import type { RtpPacket } from "werift";

export interface CodecBridgeRtpInput {
  trackId: string;
  kind: "audio" | "video";
  rtp: RtpPacket;
}

export type CodecBridgeDecodeResult =
  | {
      status: "decoded";
      frame: RealtimeFrame;
    }
  | {
      status: "unsupported";
      reason: string;
    };

export type CodecBridgeEncodeResult =
  | {
      status: "encoded";
      packets: RtpPacket[];
    }
  | {
      status: "unsupported";
      reason: string;
    };

export interface CodecBridge {
  decode(input: CodecBridgeRtpInput): Promise<CodecBridgeDecodeResult>;
  encode(frame: RealtimeFrame): Promise<CodecBridgeEncodeResult>;
}

export class UnsupportedCodecBridge implements CodecBridge {
  async decode(input: CodecBridgeRtpInput): Promise<CodecBridgeDecodeResult> {
    return {
      status: "unsupported",
      reason: `No codec bridge is configured to decode ${input.kind} RTP into realtime frames.`
    };
  }

  async encode(frame: RealtimeFrame): Promise<CodecBridgeEncodeResult> {
    return {
      status: "unsupported",
      reason: `No encoder is configured for ${frame.type} outbound realtime media.`
    };
  }
}
