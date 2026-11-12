/**
 * Music mode generation with acestep.cpp's `ace-server` (MUSIC-MODE.md
 * section 12).
 *
 * The provider advertises one capability, `music_task`. It starts a local
 * `ace-server` on demand (`acestep-server.ts`), or talks to a remote one named
 * by `ACESTEP_SERVER_URL` (BE-7). Every request and response shape here
 * follows acestep.cpp at commit 07abf07: `tools/ace-server.cpp` for the
 * endpoints and `src/request.h` for the `AceRequest` fields.
 *
 * Text-to-music and lego run `POST /lm` and then `POST /synth` with the
 * requests `/lm` returns (MF13). Repaint runs `/synth` only, and so does a
 * replay with stored audio codes. Every `/synth` asks for `wav32`, the one
 * output `ace-server` does not renormalise (MF4).
 *
 * The provider runs its own jobs one at a time per backend. `ace-server` has
 * a FIFO queue, but a text-to-music job is two backend jobs, and a second
 * request's `/lm` would otherwise run between the first request's `/lm` and
 * `/synth`. Serialising here keeps JB-3 ("runs after it") true and lets the
 * provider report `queued` exactly while an earlier job of its own is
 * unfinished, which the backend cannot (its `GET /job` has no queued state,
 * `ace-server.cpp:206-211`).
 */
import {
  aceServerPath,
  aceStepModelStatus,
  createLogger,
  importNodeBuiltin,
  runtimeLocations
} from "@nodetool-ai/config";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import type {
  Message,
  MusicTaskCandidate,
  MusicTaskName,
  MusicTaskParams,
  MusicTaskResult,
  ProviderStreamItem
} from "./types.js";
import { ACESTEP_TURBO_DIT, ACESTEP_REPO_ID, aceStepDitFor } from "./acestep-models.js";
import {
  AceServerSupervisor,
  abortable,
  sleep,
  type AceServerInstance,
  type AceServerLaunch
} from "./acestep-server.js";
import { resolveHubFile } from "./hf-hub-file.js";

const log = createLogger("nodetool.runtime.providers.acestep");

export const ACESTEP_PROVIDER_ID = "acestep";
/** The pinned acestep.cpp commit (MUSIC-MODE.md MF14). */
export const ACESTEP_COMMIT = "07abf07";
export const ACESTEP_BACKEND = `acestep.cpp@${ACESTEP_COMMIT}`;

const POLL_INTERVAL_MS = 250;
const CANCEL_WAIT_MS = 5000;
/** How long a failed request waits for the child's exit event. */
const EXIT_GRACE_MS = 2000;
const UINT32_MAX = 0xffffffff;

const INSTALL_HINT =
  "Install ACE-Step in Settings › Packages, set ACESTEP_SERVER_PATH to an ace-server binary, " +
  "or set ACESTEP_SERVER_URL to a running ace-server.";

/** Where an installed `ace-server` and its models live. */
export interface AceStepInstall {
  binary: string | null;
  modelsDir: string | null;
}

/**
 * Finds the installed `ace-server` and models folder. The default checks the
 * ACE-Step package's install locations, then PATH and the Hugging Face cache.
 */
export type AceStepInstallLocator = () => Promise<AceStepInstall>;

/**
 * What the provider resolved for its user: a remote server, or the local
 * binary and models folder it would launch. The setup status reads this, so
 * it reports the same install the provider uses.
 */
export interface AceStepResolution {
  remote: boolean;
  binary: string | null;
  modelsDir: string | null;
}

export interface AceStepProviderSecrets {
  ACESTEP_SERVER_PATH?: string;
  ACESTEP_MODELS_DIR?: string;
  ACESTEP_SERVER_URL?: string;
  ACESTEP_KEEP_LOADED?: string;
}

export interface AceStepProviderOptions {
  supervisor?: AceServerSupervisor;
  locateInstall?: AceStepInstallLocator;
  pollIntervalMs?: number;
}

/** One field set of an `AceRequest` (`src/request.h:11-126`). */
type AceRequest = Record<string, unknown>;

/** The backend lost a job: the process exited or `GET /job` forgot the id. */
class LostJobError extends Error {}

const defaultSupervisor = new AceServerSupervisor();

/** Tail of each backend's own job chain, keyed by backend. */
const ownQueues = new Map<string, Promise<void>>();

export class AceStepProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return [];
  }

  private readonly serverPath?: string;
  private readonly modelsDir?: string;
  private readonly remoteUrl?: string;
  private readonly keepLoaded: boolean;
  private readonly supervisor: AceServerSupervisor;
  private readonly locateInstall: AceStepInstallLocator;
  private readonly pollIntervalMs: number;

  constructor(secrets: AceStepProviderSecrets = {}, options: AceStepProviderOptions = {}) {
    super(ACESTEP_PROVIDER_ID);
    const setting = (name: keyof AceStepProviderSecrets): string | undefined =>
      secrets[name]?.trim() || process.env[name]?.trim() || undefined;
    this.serverPath = setting("ACESTEP_SERVER_PATH");
    this.modelsDir = setting("ACESTEP_MODELS_DIR");
    this.remoteUrl = setting("ACESTEP_SERVER_URL");
    this.keepLoaded = /^(1|true|yes|on)$/i.test(setting("ACESTEP_KEEP_LOADED") ?? "");
    this.supervisor = options.supervisor ?? defaultSupervisor;
    this.locateInstall = options.locateInstall ?? defaultAceStepInstall;
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["music_task"];
  }

  async generateMessage(_args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    throw new Error("ACE-Step does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("ACE-Step does not support chat generation");
  }

  override async unavailableReason(): Promise<string | null> {
    if (this.remoteUrl) {
      try {
        remoteBaseUrl(this.remoteUrl);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
    try {
      await this.localLaunch();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  override async musicTask(params: MusicTaskParams): Promise<MusicTaskResult> {
    const task = supportedTask(params.task);
    const caption = params.caption.trim();
    if (!caption && task !== "lego") {
      // ace-server.cpp:1031-1035 refuses a captionless text2music or repaint.
      throw new Error("ACE-Step needs a caption");
    }
    if ((task === "repaint" || task === "lego") && !params.sourceAudio?.length) {
      throw new Error(`ACE-Step ${task} needs source audio`);
    }
    if (task === "lego" && !params.trackRole) {
      throw new Error("ACE-Step lego needs a track role");
    }
    const candidates = Math.max(1, Math.trunc(params.candidates));
    const backend = this.backend();
    const signal = params.signal;
    signal?.throwIfAborted();
    return inOwnQueue(backend.key, signal, async (queueMs) => {
      params.onRunning?.();
      const job = new TaskRun(backend, this.pollIntervalMs, signal);
      backend.hold();
      try {
        return await runTask(job, task, { ...params, caption }, candidates, queueMs);
      } finally {
        backend.release();
      }
    });
  }

  /**
   * The install this provider uses for its user's settings: the same lookup
   * as a local launch, without starting anything.
   */
  async resolution(): Promise<AceStepResolution> {
    if (this.remoteUrl) {
      return { remote: true, binary: null, modelsDir: null };
    }
    const install = await this.locateInstall();
    return {
      remote: false,
      binary: (await executable(this.serverPath)) ?? (await executable(install.binary ?? undefined)),
      modelsDir: this.modelsDir ?? install.modelsDir
    };
  }

  /** The backend this provider talks to: the remote server, or the local child. */
  private backend(): Backend {
    if (this.remoteUrl) {
      const baseUrl = remoteBaseUrl(this.remoteUrl);
      return {
        key: `remote:${baseUrl}`,
        remote: true,
        open: async () => ({
          baseUrl,
          alive: () => true,
          waitForExit: async () => false,
          generation: 0,
          pid: undefined
        }),
        logTail: () => "",
        hold: () => undefined,
        release: () => undefined
      };
    }
    const supervisor = this.supervisor;
    let launch: AceServerLaunch | null = null;
    return {
      key: `local:${supervisor.id}`,
      remote: false,
      open: async (signal) => {
        launch ??= await this.localLaunch();
        return supervisor.ensure(launch, signal);
      },
      logTail: () => supervisor.logTail(),
      hold: () => supervisor.hold(),
      release: () => supervisor.release()
    };
  }

  private async localLaunch(): Promise<AceServerLaunch> {
    const { binary, modelsDir } = await this.resolution();
    if (!binary) {
      throw new Error(`ace-server is not installed. ${INSTALL_HINT}`);
    }
    if (!modelsDir) {
      throw new Error(
        "No ACE-Step models folder. Download the ACE-Step models, or set ACESTEP_MODELS_DIR " +
          "to a folder of ACE-Step GGUF files."
      );
    }
    return { binary, modelsDir, keepLoaded: this.keepLoaded };
  }
}

interface Backend {
  key: string;
  remote: boolean;
  open(signal?: AbortSignal): Promise<AceServerInstance>;
  logTail(): string;
  hold(): void;
  release(): void;
}

/** State of one `musicTask` call across its backend jobs. */
class TaskRun {
  /** One resubmit per request (MUSIC-MODE.md 12.3, JB-2 first layer). */
  resubmitsLeft = 1;

  constructor(
    readonly backend: Backend,
    readonly pollIntervalMs: number,
    readonly signal: AbortSignal | undefined
  ) {}
}

function supportedTask(task: MusicTaskName): "text2music" | "repaint" | "lego" {
  if (task === "text2music" || task === "repaint" || task === "lego") {
    return task;
  }
  throw new Error(`ACE-Step music mode does not run the ${task} task (GN-9)`);
}

async function runTask(
  run: TaskRun,
  task: "text2music" | "repaint" | "lego",
  params: MusicTaskParams,
  candidates: number,
  queueMs: number
): Promise<MusicTaskResult> {
  const baseSeed = resolveSeed(params.seed);
  const synthModel = aceStepDitFor(task, params.model);
  const common: AceRequest = {
    task_type: task,
    caption: params.caption,
    lyrics: params.lyrics ?? "[Instrumental]",
    bpm: Math.round(params.bpm),
    // An empty keyscale lets the language model choose the key (12.2).
    keyscale: params.key?.trim() ?? "",
    timesignature: String(Math.trunc(params.timeSignature)),
    seed: baseSeed,
    synth_model: synthModel
  };
  if (params.lmModel) {
    common.lm_model = params.lmModel;
  }
  if (params.steps && params.steps > 0) {
    common.inference_steps = Math.trunc(params.steps);
  }
  // Fields every request of this task carries, also the ones /lm returns.
  // wav32 is the one output ace-server does not renormalise (MF4).
  const synthFields: AceRequest = {
    task_type: task,
    synth_model: synthModel,
    output_format: "wav32"
  };
  if (common.inference_steps !== undefined) {
    synthFields.inference_steps = common.inference_steps;
  }
  if (task === "lego") {
    synthFields.track = params.trackRole;
  }
  if (task === "repaint" || task === "lego") {
    synthFields.repainting_start = params.regionStartSec ?? 0;
    synthFields.repainting_end = params.regionEndSec ?? -1;
  }
  // The language model skips its metadata pass only when the duration is
  // given too (ARCHITECTURE.md:292-295). Repaint takes the source length.
  // The prompt holds whole seconds (src/prompt.h:252-254) and /synth sizes
  // the output from the codes the model writes for them
  // (pipeline-synth-ops.cpp:318-319), so the window is rounded up: rounded
  // down, the output would end before the window does.
  if (task !== "repaint") {
    common.duration = Math.ceil(params.durationSec);
  }

  const source = task === "text2music" ? undefined : params.sourceAudio;
  let lmMs = 0;
  let synthRequests: AceRequest[];
  if (task === "repaint" || params.audioCodes) {
    const request: AceRequest = { ...common, ...synthFields, synth_batch_size: candidates };
    if (params.audioCodes) {
      request.audio_codes = params.audioCodes;
    }
    synthRequests = [request];
  } else {
    const lmStart = Date.now();
    const lmBody = { ...common, ...synthFields, lm_batch_size: candidates };
    const lmResult = await runBackendJob(run, "lm", (baseUrl) => postJson(`${baseUrl}/lm`, lmBody));
    lmMs = Date.now() - lmStart;
    const produced = parseLmResult(lmResult.bytes);
    if (produced.length < candidates) {
      log.warn("ace-server returned fewer language model results than requested", {
        requested: candidates,
        returned: produced.length
      });
    }
    synthRequests = produced.map((request) => ({ ...request, ...synthFields }));
  }

  const synthStart = Date.now();
  const synthResult = await runBackendJob(run, "synth", (baseUrl) =>
    source
      ? postMultipart(`${baseUrl}/synth`, synthRequests, source)
      : postJson(`${baseUrl}/synth`, synthRequests.length === 1 ? synthRequests[0]! : synthRequests)
  );
  const synthMs = Date.now() - synthStart;
  const audio = synthAudioParts(synthResult.bytes, synthResult.contentType);
  const expected = expectedTracks(synthRequests);
  if (audio.length !== expected.length) {
    throw new Error(`ace-server returned ${audio.length} audio tracks, expected ${expected.length}`);
  }
  const results: MusicTaskCandidate[] = audio.map((bytes, index) => {
    const track = expected[index]!;
    const candidate: MusicTaskCandidate = { audio: bytes, seed: track.seed };
    if (track.audioCodes) {
      candidate.audioCodes = track.audioCodes;
    }
    return candidate;
  });
  return {
    candidates: results,
    backend: ACESTEP_BACKEND,
    timing: { queueMs, lmMs, synthMs }
  };
}

/**
 * The seed and audio codes of each track a `/synth` call renders, in wire
 * order. `synth_worker` expands each request into `synth_batch_size` variants
 * with seeds `seed + i` (`ace-server.cpp:794-818`).
 */
function expectedTracks(requests: AceRequest[]): Array<{ seed: number; audioCodes?: string }> {
  const tracks: Array<{ seed: number; audioCodes?: string }> = [];
  for (const request of requests) {
    const batch = typeof request.synth_batch_size === "number" ? request.synth_batch_size : 1;
    const variants = Math.min(9, Math.max(1, Math.trunc(batch)));
    const seed = typeof request.seed === "number" ? request.seed : 0;
    const codes = typeof request.audio_codes === "string" && request.audio_codes ? request.audio_codes : undefined;
    for (let i = 0; i < variants; i++) {
      tracks.push({ seed: seed + i, audioCodes: codes });
    }
  }
  // ace-server.cpp:722-725 clamps one /synth call to nine tracks.
  return tracks.slice(0, 9);
}

/**
 * A seed the provider knows. A synth result carries no seed, so the provider
 * picks one when the caller gives none, in the range `ace-server` uses
 * (`src/request.h:26-29`).
 */
function resolveSeed(seed: number | undefined): number {
  if (seed !== undefined && Number.isInteger(seed) && seed >= 0) {
    return seed;
  }
  return Math.floor(Math.random() * (UINT32_MAX + 1));
}

interface JobResult {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Submit one backend job, poll it, and fetch its result. A lost job is
 * resubmitted once, after the local process is started again.
 *
 * `submit` runs without the abort signal: the server queues the job before it
 * answers with the id, so a submission aborted in flight would leave a job
 * nobody can cancel. The id is read first, then the job is cancelled.
 */
async function runBackendJob(
  run: TaskRun,
  kind: "lm" | "synth",
  submit: (baseUrl: string) => Promise<Response>
): Promise<JobResult> {
  for (;;) {
    const server = await run.backend.open(run.signal);
    try {
      return await runOnce(run, server, submit);
    } catch (error) {
      if (!(error instanceof LostJobError)) {
        throw error;
      }
      if (run.resubmitsLeft > 0) {
        run.resubmitsLeft -= 1;
        log.warn("ace-server lost a job, resubmitting it once", { kind, reason: error.message });
        continue;
      }
      const tail = run.backend.logTail();
      throw new Error(
        `ace-server lost the ${kind} job twice (${error.message}).` + (tail ? ` Last log lines:\n${tail}` : ""),
        { cause: error }
      );
    }
  }
}

async function runOnce(
  run: TaskRun,
  server: AceServerInstance,
  submit: (baseUrl: string) => Promise<Response>
): Promise<JobResult> {
  const signal = run.signal;
  const remote = run.backend.remote;
  const id = await whileAlive(run, server, async () => {
    const response = await submit(server.baseUrl);
    // ace-server.cpp:696-697 and 1062-1064: {"id":"<16 hex>"}.
    const body = await jsonBody(response, remote);
    const jobId = isRecord(body) ? body.id : undefined;
    if (typeof jobId !== "string" || !jobId) {
      throw new Error("ace-server answered a submission without a job id");
    }
    return jobId;
  });
  const jobUrl = `${server.baseUrl}/job?id=${encodeURIComponent(id)}`;
  try {
    signal?.throwIfAborted();
    for (;;) {
      const status = await whileAlive(run, server, async () => {
        const response = await aceFetch(jobUrl, { method: "GET" }, signal);
        if (!response.ok && response.status !== 404) {
          throw await httpError(response, remote);
        }
        const state = decodeAceJobStatus(await response.json().catch(() => undefined));
        if (state === "lost") {
          throw new LostJobError(`job ${id} is unknown to ace-server`);
        }
        return state;
      });
      if (status === "done") {
        break;
      }
      if (status === "failed") {
        // A failed job carries no message; the reason is in the server log.
        const tail = run.backend.logTail();
        throw new Error(`ace-server job failed.` + (tail ? ` Last log lines:\n${tail}` : ""));
      }
      if (status === "cancelled") {
        throw new Error("ace-server cancelled the job");
      }
      await sleep(run.pollIntervalMs, signal);
    }
    return await whileAlive(run, server, async () => {
      const response = await aceFetch(`${jobUrl}&result=1`, { method: "GET" }, signal);
      if (response.status === 404) {
        // Evicted between the status poll and the fetch (MAX_JOBS = 32).
        throw new LostJobError(`the result of job ${id} is gone`);
      }
      if (!response.ok) {
        throw await httpError(response, remote);
      }
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? ""
      };
    });
  } catch (error) {
    if (signal?.aborted) {
      await cancelJob(server, jobUrl);
    }
    throw error;
  }
}

export type AceJobState = "running" | "done" | "failed" | "cancelled" | "lost";

const JOB_STATES: ReadonlySet<string> = new Set(["running", "done", "failed", "cancelled"]);

/**
 * Decode a `GET /job?id=N` body. ace-server answers `{"status": ...}` with
 * one of four states (ace-server.cpp:375-387, 1828-1831), and
 * `{"error":"Job not found"}` with HTTP 404 for an id it does not hold
 * (ace-server.cpp:1813-1817), which the provider reads as a lost job.
 */
export function decodeAceJobStatus(body: unknown): AceJobState {
  if (isRecord(body)) {
    if (typeof body.status === "string" && JOB_STATES.has(body.status)) {
      return body.status as AceJobState;
    }
    if (body.error === "Job not found") {
      return "lost";
    }
  }
  throw new Error(`ace-server answered GET /job with an unknown body: ${JSON.stringify(body)?.slice(0, 200)}`);
}

/**
 * Run one request against the server. A network failure while the local
 * child exits counts as a lost job, so the caller can restart and resubmit.
 */
async function whileAlive<T>(run: TaskRun, server: AceServerInstance, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    // fetch reports a refused or reset connection as a TypeError. Anything
    // else is an answer from a live server.
    if (!(error instanceof TypeError) || run.signal?.aborted || run.backend.remote) {
      throw error;
    }
    if (!server.alive() || (await server.waitForExit(EXIT_GRACE_MS))) {
      throw new LostJobError("ace-server exited during the job");
    }
    throw error;
  }
}

/**
 * Cancel a backend job (`POST /job?id=N&cancel=1`, ace-server.cpp:1833-1858)
 * and wait until the worker sees the flag, so the next job of this provider
 * does not start behind a job that is still stopping.
 */
async function cancelJob(server: AceServerInstance, jobUrl: string): Promise<void> {
  if (!server.alive()) {
    return;
  }
  const deadline = Date.now() + CANCEL_WAIT_MS;
  try {
    await aceFetch(`${jobUrl}&cancel=1`, { method: "POST" }, AbortSignal.timeout(CANCEL_WAIT_MS));
    while (Date.now() < deadline && server.alive()) {
      const response = await aceFetch(jobUrl, { method: "GET" }, AbortSignal.timeout(CANCEL_WAIT_MS));
      const body = response.ok ? await response.json() : null;
      if (!isRecord(body) || body.status !== "running") {
        return;
      }
      await sleep(100);
    }
  } catch (error) {
    log.warn("Could not cancel the ace-server job", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Run `work` after every earlier job of this provider on `key` has finished. */
async function inOwnQueue<T>(
  key: string,
  signal: AbortSignal | undefined,
  work: (queueMs: number) => Promise<T>
): Promise<T> {
  const previous = ownQueues.get(key) ?? Promise.resolve();
  let finish!: () => void;
  const mine = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const tail = previous.then(() => mine);
  ownQueues.set(key, tail);
  const queuedAt = Date.now();
  try {
    await abortable(previous, signal);
    return await work(Date.now() - queuedAt);
  } finally {
    finish();
    if (ownQueues.get(key) === tail) {
      ownQueues.delete(key);
    }
  }
}

function aceFetch(url: string, init: RequestInit, signal: AbortSignal | undefined): Promise<Response> {
  // The URL is always the configured or spawned server plus a fixed path, and
  // a redirect is refused (docs/url-egress-inventory.md).
  return fetch(url, { ...init, redirect: "error", signal });
}

function postJson(url: string, body: unknown): Promise<Response> {
  return aceFetch(
    url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    undefined
  );
}

/**
 * `POST /synth` as multipart/form-data: the request JSON in a `request`
 * field and the source in a file part named `audio` (ace-server.cpp:931-984).
 */
function postMultipart(url: string, requests: AceRequest[], source: Uint8Array): Promise<Response> {
  const form = new FormData();
  form.append("request", JSON.stringify(requests.length === 1 ? requests[0] : requests));
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  form.append("audio", new Blob([copy.buffer], { type: "audio/wav" }), "source.wav");
  return aceFetch(url, { method: "POST", body: form }, undefined);
}

/** A JSON body, or the `{"error": ...}` body of a refused request as an Error. */
async function jsonBody(response: Response, remote: boolean): Promise<unknown> {
  if (!response.ok) {
    throw await httpError(response, remote);
  }
  return response.json();
}

/**
 * ace-server.cpp:519-529 answers errors as {"error":"message"}. The local
 * child's message is shown. A remote server's body is only logged: whatever
 * answers at that address chooses it, and it would reach the user verbatim.
 */
async function httpError(response: Response, remote: boolean): Promise<Error> {
  const text = await response.text();
  let message = text.slice(0, 1000);
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed) && typeof parsed.error === "string") {
      message = parsed.error;
    }
  } catch {
    // Not JSON: keep the text.
  }
  if (remote) {
    log.warn("The remote ace-server refused a request", { status: response.status, body: message });
    return new Error(`ace-server HTTP ${response.status}. The server log has the response.`);
  }
  return new Error(`ace-server HTTP ${response.status}: ${message}`);
}

/** The `/lm` result: a JSON array of enriched requests (ace-server.cpp:597-609). */
function parseLmResult(bytes: Uint8Array): AceRequest[] {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isRecord)) {
    throw new Error("ace-server returned no language model result");
  }
  return parsed;
}

/**
 * The audio parts of a `/synth` result. The body is multipart/mixed with one
 * audio part and one latent part per track (ace-server.cpp:276-302, 884-889).
 * Each audio part must be a 32-bit float WAV (fmt tag 3, audio-io.h:513-539).
 */
export function synthAudioParts(bytes: Uint8Array, contentType: string): Uint8Array[] {
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (!boundary) {
    throw new Error(`ace-server synth result is not multipart (${contentType || "no content type"})`);
  }
  const audio: Uint8Array[] = [];
  for (const part of multipartParts(bytes, boundary)) {
    const type = /^content-type:\s*([^\r\n;]+)/im.exec(part.headers)?.[1]?.trim().toLowerCase() ?? "";
    if (!type.startsWith("audio/")) {
      continue;
    }
    if (type !== "audio/wav" || !isFloatWav(part.body)) {
      throw new Error(`ace-server returned ${type} audio, not the 32-bit float WAV that was requested`);
    }
    audio.push(part.body);
  }
  return audio;
}

function multipartParts(bytes: Uint8Array, boundary: string): Array<{ headers: string; body: Uint8Array }> {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const delimiter = Buffer.from(`--${boundary}`);
  const parts: Array<{ headers: string; body: Uint8Array }> = [];
  let start = buffer.indexOf(delimiter);
  while (start !== -1) {
    const afterDelimiter = start + delimiter.length;
    if (buffer[afterDelimiter] === 0x2d && buffer[afterDelimiter + 1] === 0x2d) {
      break;
    }
    const headerStart = afterDelimiter + 2;
    const headerEnd = buffer.indexOf("\r\n\r\n", headerStart);
    if (headerEnd === -1) {
      break;
    }
    const next = buffer.indexOf(Buffer.concat([Buffer.from("\r\n"), delimiter]), headerEnd + 4);
    if (next === -1) {
      break;
    }
    parts.push({
      headers: buffer.subarray(headerStart, headerEnd).toString("latin1"),
      body: new Uint8Array(buffer.subarray(headerEnd + 4, next))
    });
    start = next + 2;
  }
  return parts;
}

function isFloatWav(bytes: Uint8Array): boolean {
  if (bytes.length < 44) {
    return false;
  }
  const ascii = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return ascii(0) === "RIFF" && ascii(8) === "WAVE" && view.getUint16(20, true) === 3 && view.getUint16(34, true) === 32;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The configured remote server's base URL, without a trailing slash. */
function remoteBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`ACESTEP_SERVER_URL is not a URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`ACESTEP_SERVER_URL must be http or https, not ${url.protocol}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("ACESTEP_SERVER_URL must name a server, with no credentials, query or fragment");
  }
  return url.toString().replace(/\/+$/, "");
}

async function executable(candidate: string | undefined): Promise<string | null> {
  if (!candidate) {
    return null;
  }
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  if (!fs) {
    return null;
  }
  try {
    await fs.access(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * The default install lookup. The binary comes from the install the ACE-Step
 * package makes (this host, then the CLI host), then PATH. The models folder
 * is the managed one when it holds the turbo DiT, then the CLI host's, then
 * the Hugging Face cache folder that holds it. Whether `ace-server --models`
 * accepts a hub snapshot folder is MM0 item 7, so an explicit
 * ACESTEP_MODELS_DIR wins.
 */
export async function defaultAceStepInstall(): Promise<AceStepInstall> {
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!path) {
    return { binary: null, modelsDir: null };
  }
  const hosts = [runtimeLocations()];
  try {
    hosts.push(runtimeLocations({ ...process.env, NODETOOL_HOST: "cli" }));
  } catch {
    // Only the configured location applies.
  }
  const candidates: string[] = [];
  for (const host of hosts) {
    if (host.aceStep) {
      candidates.push(aceServerPath(host.aceStep));
    }
  }
  const exe = process.platform === "win32" ? "ace-server.exe" : "ace-server";
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir) {
      candidates.push(path.join(dir, exe));
    }
  }
  let binary: string | null = null;
  for (const candidate of candidates) {
    if ((binary = await executable(candidate))) {
      break;
    }
  }
  for (const host of hosts) {
    if (host.aceStepModels) {
      const status = await aceStepModelStatus(host.aceStepModels, ["ditTurbo"]).catch(() => null);
      if (status && status.missing.length === 0) {
        return { binary, modelsDir: host.aceStepModels };
      }
    }
  }
  const turbo = await resolveHubFile(ACESTEP_REPO_ID, ACESTEP_TURBO_DIT).catch(() => null);
  return { binary, modelsDir: turbo ? path.dirname(turbo) : null };
}

/**
 * Start the local `ace-server` for the provider contract probe. Null when no
 * binary or models folder is installed, so the probe skips.
 */
export async function startAceStepProbeServer(
  env: Record<string, string | undefined> = process.env
): Promise<{ baseUrl: string; stop: () => Promise<void> } | null> {
  const install = await defaultAceStepInstall();
  const binary = (await executable(env.ACESTEP_SERVER_PATH?.trim())) ?? install.binary;
  const modelsDir = env.ACESTEP_MODELS_DIR?.trim() || install.modelsDir;
  if (!binary || !modelsDir) {
    return null;
  }
  const supervisor = new AceServerSupervisor();
  const server = await supervisor.ensure({ binary, modelsDir });
  return { baseUrl: server.baseUrl, stop: () => supervisor.stop() };
}
