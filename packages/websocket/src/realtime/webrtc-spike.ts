import {
  MediaStreamTrack,
  RTCPeerConnection,
  RtpHeader,
  RtpPacket
} from "werift";

type SpikeStatus = "passed" | "failed";
type CodecSpikeStatus = SpikeStatus | "unsupported";

export interface WebRtcSpikeResult {
  offerAnswer: SpikeStatus;
  iceConnected: SpikeStatus;
  inboundRtp: SpikeStatus;
  decodedVideoFrame: CodecSpikeStatus;
  outboundEncodedTrack: CodecSpikeStatus;
  teardown: SpikeStatus;
  notes: string[];
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const makeVp8ProbePacket = (): RtpPacket =>
  new RtpPacket(
    new RtpHeader({
      payloadType: 96,
      marker: true,
      sequenceNumber: 1,
      timestamp: 1,
      ssrc: 1234
    }),
    // Minimal VP8 payload descriptor plus placeholder payload bytes. This is
    // enough to prove RTP routing but not enough to represent a decoded frame.
    Buffer.from([0x10, 0x00, 0x00, 0x00])
  );

export async function runWeriftMediaSpike(): Promise<WebRtcSpikeResult> {
  const notes: string[] = [];
  const operatorPeer = new RTCPeerConnection();
  const runtimePeer = new RTCPeerConnection();
  const operatorTrack = new MediaStreamTrack({ kind: "video" });
  let remoteVideoTrackSeen = false;
  let receivedRtp: RtpPacket | null = null;

  const result: WebRtcSpikeResult = {
    offerAnswer: "failed",
    iceConnected: "failed",
    inboundRtp: "failed",
    decodedVideoFrame: "unsupported",
    outboundEncodedTrack: "unsupported",
    teardown: "failed",
    notes
  };

  try {
    operatorPeer.createDataChannel("spike-probe");
    operatorPeer.addTrack(operatorTrack);

    runtimePeer.onTrack.subscribe((track) => {
      remoteVideoTrackSeen = track.kind === "video";
      track.onReceiveRtp.subscribe((rtp) => {
        receivedRtp = rtp;
      });
    });

    await operatorPeer.setLocalDescription(await operatorPeer.createOffer());
    await runtimePeer.setRemoteDescription(operatorPeer.localDescription!);
    await runtimePeer.setLocalDescription(await runtimePeer.createAnswer());
    await operatorPeer.setRemoteDescription(runtimePeer.localDescription!);
    result.offerAnswer = "passed";

    await withTimeout(
      operatorPeer.connectionStateChange.watch((state) => state === "connected"),
      5000,
      "werift peer connection"
    );
    result.iceConnected = "passed";

    operatorTrack.writeRtp(makeVp8ProbePacket());
    await withTimeout(
      (async () => {
        while (!receivedRtp) {
          await wait(10);
        }
      })(),
      1000,
      "inbound RTP delivery"
    );
    result.inboundRtp = "passed";

    if (remoteVideoTrackSeen && receivedRtp) {
      notes.push(
        "werift exposes inbound RTP packets on remote video tracks, suitable for a frame-router boundary after codec decode is provided."
      );
    }

    notes.push(
      "werift does not decode compressed RTP payloads into raw RGBA/YUV pixels; decodedVideoFrame is unsupported without a codec bridge."
    );
    notes.push(
      "werift can packetize/send RTP from an encoded source, but it does not encode raw VideoFrame pixels; outboundEncodedTrack is unsupported without a VP8/H264 encoder."
    );
  } finally {
    operatorTrack.stop();
    await Promise.allSettled([operatorPeer.close(), runtimePeer.close()]);
    result.teardown =
      operatorPeer.connectionState === "closed" &&
      runtimePeer.connectionState === "closed"
        ? "passed"
        : "failed";
  }

  return result;
}
