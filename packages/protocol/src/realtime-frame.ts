export type VideoPixelFormat = "rgba8" | "rgb8" | "yuv420p" | "nv12";

export type AudioSampleFormat = "s16le" | "f32le";

export interface VideoFrame {
  type: "realtime_video_frame";
  data: Uint8Array;
  width: number;
  height: number;
  stride: number;
  pixel_format: VideoPixelFormat;
  timestamp_ns: number;
  sequence: number;
}

export interface AudioFrame {
  type: "realtime_audio_frame";
  data: Uint8Array;
  sample_rate: number;
  channels: number;
  sample_format: AudioSampleFormat;
  samples: number;
  timestamp_ns: number;
  sequence: number;
}

export type RealtimeFrame = VideoFrame | AudioFrame;
