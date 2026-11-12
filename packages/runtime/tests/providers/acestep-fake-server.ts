/**
 * A fake acestep.cpp `ace-server` for the acestep provider tests.
 *
 * It reproduces the HTTP API of `tools/ace-server.cpp` at commit 07abf07:
 * the endpoints, the job lifecycle of one FIFO worker, the request parsing,
 * the error bodies and the multipart/mixed synth result. Every behaviour
 * cites the line it mirrors. Paths are relative to the acestep.cpp checkout.
 *
 * One deliberate difference: generated audio is shorter than requested
 * (`lengthScale`), so the tests move kilobytes, not megabytes. The WAV
 * container, sample format and track count are the real ones.
 *
 * The file uses only erasable TypeScript, so `acestep-fake-server-bin.mjs`
 * can run it as a child process under Node's type stripping.
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/** A request the fake received, decoded for assertions. */
export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  contentType: string;
  /** JSON body of a plain JSON request. */
  json?: unknown;
  /** The `request` part of a multipart request, parsed. */
  multipartRequest?: unknown;
  /** Whether `request` came as a field (true) or as a file part. */
  multipartRequestIsField?: boolean;
  /** The `audio` file part of a multipart request. */
  audio?: Uint8Array;
  audioFilename?: string;
}

type JobStatus = "running" | "done" | "failed" | "cancelled";

interface FakeJob {
  id: string;
  kind: "lm" | "synth";
  status: JobStatus;
  cancel: boolean;
  resultBody: Buffer;
  resultMime: string;
  /** Resolves when the test releases a held job. */
  gate: Promise<void> | null;
  open: (() => void) | null;
  run: (job: FakeJob) => Promise<void>;
}

export interface FakeAceOptions {
  host?: string;
  port?: number;
  /** `--max-batch`, default 1 as in ace-server.cpp:198. */
  maxBatch?: number;
  /** Worker time per job, in ms, checked for cancel every 10 ms. */
  jobMs?: number;
  /** Hold every job in the running state until {@link FakeAceServer.release}. */
  holdJobs?: boolean;
  /** Fraction of the requested length that is rendered. */
  lengthScale?: number;
  /** Called when a job starts on the worker, before it runs. */
  onJobStart?: (job: { id: string; kind: "lm" | "synth" }) => void;
  /** stderr lines, as ace-server writes them. */
  log?: (line: string) => void;
}

export interface FakeAceServer {
  baseUrl: string;
  port: number;
  requests: RecordedRequest[];
  /** Order in which the worker started jobs. */
  started: Array<{ id: string; kind: "lm" | "synth" }>;
  jobStatus(id: string): JobStatus | undefined;
  /** Let a held job (or every held job) run to the end. */
  release(id?: string): void;
  /** Drop every job, as a restarted process would (GET /job then answers 404). */
  forgetJobs(): void;
  close(): Promise<void>;
}

const SAMPLE_RATE = 48000;
// ace-server.cpp:229 MAX_JOBS, ace-server.cpp:274 MULTIPART_BOUNDARY.
const MAX_JOBS = 32;
const MULTIPART_BOUNDARY = "ace-batch-boundary";
const LATENT_CHANNELS = 64;
const OUTPUT_FORMATS = new Set(["mp3", "wav16", "wav24", "wav32"]);
const TASKS_WITHOUT_CAPTION = new Set(["lego", "extract", "complete"]);

export async function startFakeAceServer(options: FakeAceOptions = {}): Promise<FakeAceServer> {
  const maxBatch = Math.min(9, Math.max(1, options.maxBatch ?? 1));
  const jobMs = options.jobMs ?? 20;
  const lengthScale = options.lengthScale ?? 0.01;
  const log = options.log ?? ((): void => undefined);
  const requests: RecordedRequest[] = [];
  const started: Array<{ id: string; kind: "lm" | "synth" }> = [];
  const jobs = new Map<string, FakeJob>();
  const order: string[] = [];
  const queue: FakeJob[] = [];
  let working = false;

  // ace-server.cpp:340-367: create, then evict the oldest finished jobs.
  const createJob = (kind: "lm" | "synth", run: (job: FakeJob) => Promise<void>): FakeJob => {
    // ace-server.cpp:330-338: 64 random bits as 16 hex digits.
    const job: FakeJob = {
      id: randomBytes(8).toString("hex"),
      kind,
      status: "running",
      cancel: false,
      resultBody: Buffer.alloc(0),
      resultMime: "",
      gate: null,
      open: null,
      run
    };
    if (options.holdJobs) {
      job.gate = new Promise<void>((resolve) => {
        job.open = resolve;
      });
    }
    jobs.set(job.id, job);
    order.push(job.id);
    while (order.length > MAX_JOBS) {
      const index = order.findIndex((id) => jobs.get(id)?.status !== "running");
      if (index === -1) {
        break;
      }
      jobs.delete(order[index]!);
      order.splice(index, 1);
    }
    // ace-server.cpp:152-174: one FIFO worker thread.
    queue.push(job);
    void pump();
    return job;
  };

  const pump = async (): Promise<void> => {
    if (working) {
      return;
    }
    working = true;
    while (queue.length > 0) {
      const job = queue.shift()!;
      if (!jobs.has(job.id)) {
        continue;
      }
      started.push({ id: job.id, kind: job.kind });
      options.onJobStart?.({ id: job.id, kind: job.kind });
      // lm_worker and synth_worker check the cancel flag first
      // (ace-server.cpp:549-552, 728-733).
      if (job.cancel) {
        job.status = "cancelled";
        continue;
      }
      if (job.gate) {
        await Promise.race([job.gate, waitForCancel(job)]);
        job.gate = null;
      }
      // The pipelines poll the flag between steps (ARCHITECTURE.md:1002-1003).
      for (let waited = 0; waited < jobMs && !job.cancel; waited += 10) {
        await delay(Math.min(10, jobMs - waited));
      }
      if (job.cancel) {
        job.status = "cancelled";
        continue;
      }
      await job.run(job);
    }
    working = false;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://fake");
    const body = await readBody(req);
    const contentType = String(req.headers["content-type"] ?? "");
    const recorded: RecordedRequest = {
      method: req.method ?? "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      contentType
    };
    requests.push(recorded);
    const route = `${req.method} ${url.pathname}`;

    if (route === "GET /health") {
      // ace-server.cpp:1801-1803.
      sendJson(res, 200, { status: "ok" });
      return;
    }
    if (route === "POST /lm") {
      // ace-server.cpp:624-698.
      const parsed = parseRequestArray(body.toString("utf8"));
      recorded.json = safeJson(body.toString("utf8"));
      if (!parsed) {
        sendError(res, 400, "Invalid JSON");
        return;
      }
      if (parsed.length > maxBatch) {
        sendError(res, 400, "Request array exceeds max_batch");
        return;
      }
      if (parsed.some((item) => !text(item.caption))) {
        sendError(res, 400, "Caption is required");
        return;
      }
      const mode = text(parsed[0]!.lm_mode) || "generate";
      if (!["generate", "inspire", "format"].includes(mode)) {
        sendError(res, 400, "Invalid lm_mode (use: generate, inspire, format)");
        return;
      }
      let items: Record<string, unknown>[];
      if (parsed.length === 1) {
        // ace-server.cpp:664-682: expand into lm_batch_size seed variants,
        // clamped to [1, max_batch], seeds base + b.
        const batch = Math.min(maxBatch, Math.max(1, integer(parsed[0]!.lm_batch_size, 1)));
        const base = { ...parsed[0]! };
        base.lm_seed = resolveSeed(base.lm_seed);
        base.seed = resolveSeed(base.seed);
        items = Array.from({ length: batch }, (_, b) => ({
          ...base,
          lm_seed: (base.lm_seed as number) + b,
          seed: (base.seed as number) + b
        }));
      } else {
        items = parsed.map((item) => ({ ...item, lm_seed: resolveSeed(item.lm_seed), seed: resolveSeed(item.seed) }));
      }
      const job = createJob("lm", async (j) => {
        // ace-server.cpp:597-609: a JSON array of enriched requests, serialised
        // by request_to_json (src/request.cpp:324-475), which always writes
        // caption, seed, solver, lm_mode, output_format and task_type.
        const out = items.map((item) => lmOutput(item, mode));
        j.resultBody = Buffer.from(JSON.stringify(out));
        j.resultMime = "application/json";
        j.status = "done";
        log(`[Server] Job ${j.id} done (LM, ${out.length} results)`);
      });
      log(`[Server] Job ${job.id} created (LM, N=${items.length})`);
      // ace-server.cpp:696-697.
      sendRaw(res, 200, "application/json", Buffer.from(`{"id":"${job.id}"}`));
      return;
    }
    if (route === "POST /synth") {
      // ace-server.cpp:913-1065.
      let parsed: Record<string, unknown>[] | null;
      let source: Uint8Array | null = null;
      if (contentType.toLowerCase().startsWith("multipart/form-data")) {
        const form = await new Request("http://fake/synth", {
          method: "POST",
          headers: { "content-type": contentType },
          body
        }).formData();
        // ace-server.cpp:935-942: "request" as a file part or a field.
        const requestPart = form.get("request");
        if (requestPart === null) {
          sendError(res, 400, "Multipart: missing 'request' part");
          return;
        }
        const requestText = typeof requestPart === "string" ? requestPart : await requestPart.text();
        recorded.multipartRequest = safeJson(requestText);
        recorded.multipartRequestIsField = typeof requestPart === "string";
        parsed = parseRequestArray(requestText);
        if (!parsed) {
          sendError(res, 400, "Multipart: invalid JSON in 'request' part");
          return;
        }
        // ace-server.cpp:968-984: the source is the file part "audio".
        const audio = form.get("audio");
        if (audio !== null && typeof audio !== "string") {
          const bytes = new Uint8Array(await audio.arrayBuffer());
          recorded.audio = bytes;
          recorded.audioFilename = audio.name;
          if (bytes.length === 0) {
            sendError(res, 400, "Multipart: empty 'audio' part");
            return;
          }
          if (wavFrames(bytes) === null) {
            sendError(res, 400, "Failed to decode audio");
            return;
          }
          source = bytes;
        }
      } else {
        recorded.json = safeJson(body.toString("utf8"));
        parsed = parseRequestArray(body.toString("utf8"));
        if (!parsed) {
          sendError(res, 400, "Invalid JSON");
          return;
        }
      }
      const first = parsed[0]!;
      const task = text(first.task_type) || "text2music";
      if (!text(first.caption) && !TASKS_WITHOUT_CAPTION.has(task)) {
        sendError(res, 400, "Caption is required");
        return;
      }
      // ace-server.cpp:1037-1048, src/audio-io.h:380-401.
      const format = text(first.output_format) || "mp3";
      if (!OUTPUT_FORMATS.has(format)) {
        sendError(res, 400, "Invalid output_format (use: mp3, wav16, wav24, wav32)");
        return;
      }
      const job = createJob("synth", async (j) => {
        // ace-server.cpp:714-726 and 794-818: synth_batch_size variants per
        // request, seeds base + i, clamped to nine tracks.
        const tracks: Array<{ seed: number; seconds: number }> = [];
        for (const request of parsed!) {
          const variants = Math.min(9, Math.max(1, integer(request.synth_batch_size, 1)));
          const seed = resolveSeed(request.seed);
          const seconds = source
            ? (wavFrames(source) ?? 0) / SAMPLE_RATE
            : Number(request.duration) > 0
              ? Number(request.duration)
              : 1;
          for (let i = 0; i < variants && tracks.length < 9; i++) {
            tracks.push({ seed: seed + i, seconds });
          }
        }
        const frames = (seconds: number): number => Math.max(1, Math.round(seconds * SAMPLE_RATE * lengthScale));
        const audio = tracks.map((track) =>
          format === "mp3" ? Buffer.from("ID3fake-mp3") : encodeWav(frames(track.seconds), format, track.seed)
        );
        // ace-server.cpp:276-302 and 884-889.
        j.resultBody = multipartAudioLatent(audio, format === "mp3" ? "audio/mpeg" : "audio/wav");
        j.resultMime = `multipart/mixed; boundary=${MULTIPART_BOUNDARY}`;
        j.status = "done";
        log(`[Server] Job ${j.id} done (${tracks.length} tracks)`);
      });
      log(`[Server] Job ${job.id} created (${parsed.length} requests)`);
      sendRaw(res, 200, "application/json", Buffer.from(`{"id":"${job.id}"}`));
      return;
    }
    if (url.pathname === "/job") {
      // ace-server.cpp:1808-1858.
      const id = url.searchParams.get("id");
      if (id === null) {
        sendError(res, 400, "Missing id parameter");
        return;
      }
      const job = jobs.get(id);
      if (!job) {
        sendError(res, 404, "Job not found");
        return;
      }
      if (req.method === "GET") {
        if (url.searchParams.get("result") === "1") {
          if (job.status !== "done") {
            sendError(res, 404, "Result not ready");
            return;
          }
          sendRaw(res, 200, job.resultMime, job.resultBody);
          return;
        }
        sendJson(res, 200, { status: job.status });
        return;
      }
      if (req.method === "POST") {
        if (url.searchParams.get("cancel") === "1") {
          let status: JobStatus = job.status;
          if (status === "running") {
            job.cancel = true;
            log(`[Server] Cancel requested for job ${job.id}`);
            status = "cancelled";
          }
          sendJson(res, 200, { status });
          return;
        }
        sendError(res, 400, "Unknown action");
        return;
      }
    }
    // httplib answers an unregistered route with 404 and an empty body.
    sendRaw(res, 404, "text/plain", Buffer.alloc(0));
  };

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      sendError(res, 500, error instanceof Error ? error.message : String(error));
    });
  });
  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  // ace-server.cpp:1883.
  log(`[Server] Listening on ${host}:${port}`);

  return {
    baseUrl: `http://${host}:${port}`,
    port,
    requests,
    started,
    jobStatus: (id) => jobs.get(id)?.status,
    release: (id) => {
      for (const job of jobs.values()) {
        if (!id || job.id === id) {
          job.open?.();
        }
      }
    },
    forgetJobs: () => {
      // A new process has neither the jobs nor the queue of the old one.
      for (const job of jobs.values()) {
        job.cancel = true;
        job.open?.();
      }
      queue.length = 0;
      jobs.clear();
      order.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const job of jobs.values()) {
          job.cancel = true;
          job.open?.();
        }
        server.closeAllConnections();
        server.close(() => resolve());
      })
  };
}

/**
 * request_to_json (src/request.cpp:324-475) of an LM result. The language
 * model fills `audio_codes`; the fake derives them from the seed.
 */
function lmOutput(item: Record<string, unknown>, mode: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...item };
  out.caption = text(item.caption);
  out.seed = item.seed;
  out.lm_seed = item.lm_seed;
  if (mode === "generate" && !text(item.audio_codes)) {
    const seed = Number(item.seed);
    out.audio_codes = [seed % 64000, (seed + 7) % 64000, (seed + 13) % 64000].join(",");
  }
  out.solver = text(item.solver) || "euler";
  out.lm_mode = mode;
  out.output_format = text(item.output_format) || "mp3";
  out.task_type = text(item.task_type) || "text2music";
  // src/request.cpp:222-227: instrumental lyrics force vocal_language.
  if (out.lyrics === "[Instrumental]") {
    out.vocal_language = "unknown";
  }
  return out;
}

/** src/request.cpp:251-284: one object or an array of objects. */
function parseRequestArray(json: string): Record<string, unknown>[] | null {
  const parsed = safeJson(json);
  if (isRecord(parsed)) {
    return [parsed];
  }
  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isRecord)) {
    return parsed;
  }
  return null;
}

/** src/request.cpp:563-575: a negative seed becomes a random one. */
function resolveSeed(value: unknown): number {
  const seed = typeof value === "number" ? Math.trunc(value) : -1;
  return seed >= 0 ? seed : randomBytes(4).readUInt32LE(0);
}

/**
 * src/audio-io.h:431-539: a 44-byte classic RIFF header, fmt tag 3 for
 * wav32 and 1 for wav16 and wav24, interleaved stereo. Every sample holds
 * the track's seed, so a test can tell the candidates apart.
 */
function encodeWav(frames: number, format: string, seed: number): Buffer {
  const bits = format === "wav32" ? 32 : format === "wav24" ? 24 : 16;
  const bytesPerSample = bits / 8;
  const dataSize = frames * 2 * bytesPerSample;
  const out = Buffer.alloc(44 + dataSize);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(format === "wav32" ? 3 : 1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SAMPLE_RATE, 24);
  out.writeUInt32LE(SAMPLE_RATE * 2 * bytesPerSample, 28);
  out.writeUInt16LE(2 * bytesPerSample, 32);
  out.writeUInt16LE(bits, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataSize, 40);
  const value = (seed % 1000) / 1000;
  for (let i = 0; i < frames * 2; i++) {
    const offset = 44 + i * bytesPerSample;
    if (bits === 32) {
      out.writeFloatLE(value, offset);
    } else if (bits === 16) {
      out.writeInt16LE(Math.round(value * 32767), offset);
    } else {
      out.writeIntLE(Math.round(value * 8388607), offset, 3);
    }
  }
  return out;
}

/** Frames of a WAV, or null when it is not one (src/wav.h decodes RIFF). */
export function wavFrames(bytes: Uint8Array): number | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  const channels = buffer.readUInt16LE(22);
  const bits = buffer.readUInt16LE(34);
  const dataSize = buffer.readUInt32LE(40);
  return Math.floor(dataSize / (channels * (bits / 8)));
}

/** ace-server.cpp:276-302: one audio part and one latent part per track. */
function multipartAudioLatent(audio: Buffer[], mime: string): Buffer {
  const chunks: Buffer[] = [];
  for (const part of audio) {
    chunks.push(Buffer.from(`--${MULTIPART_BOUNDARY}\r\nContent-Type: ${mime}\r\n\r\n`));
    chunks.push(part);
    chunks.push(Buffer.from("\r\n"));
    chunks.push(
      Buffer.from(
        `--${MULTIPART_BOUNDARY}\r\nContent-Type: application/octet-stream\r\n` +
          'Content-Disposition: form-data; name="latent"\r\n\r\n'
      )
    );
    // Two latent frames of raw f32 [T * 64] (ace-server.cpp:237-241).
    chunks.push(Buffer.alloc(2 * LATENT_CHANNELS * 4));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${MULTIPART_BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

/** ace-server.cpp:519-529: {"error":"message"} with the status. */
function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  sendRaw(res, status, "application/json", Buffer.from(JSON.stringify(value)));
}

function sendRaw(res: ServerResponse, status: number, mime: string, body: Buffer): void {
  if (res.headersSent) {
    return;
  }
  res.writeHead(status, { "Content-Type": mime, "Content-Length": body.length });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function waitForCancel(job: FakeJob): Promise<void> {
  return new Promise((resolve) => {
    const tick = (): void => {
      if (job.cancel || job.gate === null) {
        resolve();
      } else {
        setTimeout(tick, 10);
      }
    };
    tick();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}
