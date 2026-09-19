import {
  getAudioDownloadFilename,
  getAudioExtension,
  getAudioMimeType
} from "../audioFormat";

describe("getAudioExtension", () => {
  it("maps the aliases providers emit for one container", () => {
    expect(getAudioExtension("audio/wav")).toBe("wav");
    expect(getAudioExtension("audio/x-wav")).toBe("wav");
    expect(getAudioExtension("audio/vnd.wave")).toBe("wav");
    expect(getAudioExtension("audio/mpeg")).toBe("mp3");
    expect(getAudioExtension("audio/mp4")).toBe("m4a");
  });

  it("ignores parameters and casing", () => {
    expect(getAudioExtension("Audio/WAV; codecs=1")).toBe("wav");
  });

  it("falls back to the subtype of an unlisted audio type", () => {
    expect(getAudioExtension("audio/amr")).toBe("amr");
  });

  it("returns undefined for missing, opaque, and non-audio types", () => {
    expect(getAudioExtension(undefined)).toBeUndefined();
    expect(getAudioExtension("")).toBeUndefined();
    expect(getAudioExtension("application/octet-stream")).toBeUndefined();
    expect(getAudioExtension("video/mp4")).toBeUndefined();
  });
});

describe("getAudioMimeType", () => {
  it("maps format tokens whose subtype differs", () => {
    expect(getAudioMimeType("mp3")).toBe("audio/mp3");
    expect(getAudioMimeType("m4a")).toBe("audio/mp4");
  });

  it("builds audio/<token> for tokens that match their subtype", () => {
    expect(getAudioMimeType("wav")).toBe("audio/wav");
    expect(getAudioMimeType("flac")).toBe("audio/flac");
    expect(getAudioMimeType(".WAV")).toBe("audio/wav");
  });

  it("returns undefined for missing or unusable tokens", () => {
    expect(getAudioMimeType(undefined)).toBeUndefined();
    expect(getAudioMimeType("")).toBeUndefined();
    expect(getAudioMimeType("audio/wav")).toBeUndefined();
  });
});

describe("getAudioDownloadFilename", () => {
  it("keeps the served format instead of defaulting to mp3", () => {
    expect(
      getAudioDownloadFilename({ contentType: "audio/wav" })
    ).toBe("audio.wav");
  });

  it("prefers the served content type over the declared mime type", () => {
    expect(
      getAudioDownloadFilename({
        contentType: "audio/wav",
        mimeType: "audio/mp3"
      })
    ).toBe("audio.wav");
  });

  it("falls back to the declared mime type when the transfer is opaque", () => {
    expect(
      getAudioDownloadFilename({
        contentType: "application/octet-stream",
        mimeType: "audio/flac"
      })
    ).toBe("audio.flac");
  });

  it("falls back to the URL extension when no type is known", () => {
    expect(
      getAudioDownloadFilename({
        url: "https://cdn.example.com/files/output.wav?token=abc"
      })
    ).toBe("audio.wav");
  });

  it("keeps a caller filename that already names a format", () => {
    expect(
      getAudioDownloadFilename({
        filename: "seed-audio.wav",
        contentType: "audio/mp3"
      })
    ).toBe("seed-audio.wav");
  });

  it("extends a caller filename that names no format", () => {
    expect(
      getAudioDownloadFilename({
        filename: "seed-audio",
        contentType: "audio/wav"
      })
    ).toBe("seed-audio.wav");
  });

  it("emits no extension rather than guessing one", () => {
    expect(getAudioDownloadFilename({ url: "blob:http://localhost/abc" })).toBe(
      "audio"
    );
  });
});
