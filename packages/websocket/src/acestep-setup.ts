/**
 * First-run setup of ACE-Step music mode, exposed to clients through the
 * `acestep_*` WebSocket commands (MUSIC-MODE.md section 12.4).
 *
 * The service reports whether `ace-server` and the model files are on disk,
 * installs the pinned binary and downloads a named set of model files. It
 * holds one operation at a time for the whole server, so a client that
 * reconnects mid-download reads the same progress from `status()`.
 *
 * What it reports as remote, installed and present follows the acestep
 * provider's own resolution for the requesting user (`AceStepResolution`):
 * that user's `ACESTEP_SERVER_URL`, `ACESTEP_SERVER_PATH` and
 * `ACESTEP_MODELS_DIR` settings, then the managed install, PATH and the
 * Hugging Face cache. The command handler resolves the provider for the user
 * and passes its resolution in.
 */
import { randomUUID } from "node:crypto";
import {
  ACESTEP_ADD_INSTRUMENT_ROLES,
  ACESTEP_FIRST_RUN_ROLES,
  AceStepInstallError,
  aceStepAsset,
  aceStepInstallStatus,
  aceStepModelFiles,
  aceStepModelStatus,
  installAceStep,
  runtimeLocations,
  type AceStepModelRole
} from "@nodetool-ai/config";
import type {
  AceStepModelSet,
  AceStepSetupOperation,
  AceStepSetupResult,
  AceStepSetupStatus
} from "@nodetool-ai/protocol";
import { AceStepProvider, type AceStepResolution } from "@nodetool-ai/runtime";
import { downloadAceStepModels, type AceStepModelProgress } from "@nodetool-ai/runtime-install";

type Refusal = NonNullable<AceStepSetupResult["reason"]>;

const MODEL_SET_ROLES: Record<AceStepModelSet, readonly AceStepModelRole[]> = {
  first_run: ACESTEP_FIRST_RUN_ROLES,
  add_instrument: ACESTEP_ADD_INSTRUMENT_ROLES
};

export interface AceStepSetupDeps {
  /** `{ aceStep, aceStepModels }` of the host. */
  locations: () => { aceStep: string | null; aceStepModels: string | null };
  platform: string;
  arch: string;
  /**
   * The provider resolution used when the caller passes none: the server's
   * environment, without a user's settings.
   */
  resolve: () => Promise<AceStepResolution>;
  /** The release archive for a platform. Tests supply one with a digest. */
  asset: typeof aceStepAsset;
  install: typeof installAceStep;
  downloadModels: typeof downloadAceStepModels;
}

const defaultDeps = (): AceStepSetupDeps => ({
  locations: () => runtimeLocations(),
  platform: process.platform,
  arch: process.arch,
  resolve: () => new AceStepProvider().resolution(),
  asset: aceStepAsset,
  install: installAceStep,
  downloadModels: downloadAceStepModels
});

type Listener = (operation: AceStepSetupOperation) => void;

export class AceStepSetupService {
  private operation: AceStepSetupOperation | null = null;
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly deps: AceStepSetupDeps = defaultDeps()) {}

  /** Receive each progress change. Returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves when the current operation has ended. For tests and shutdown. */
  async settled(): Promise<void> {
    await this.running;
  }

  /**
   * The status for a user. `resolution` is the acestep provider's resolution
   * for that user; without one the server's environment applies.
   */
  async status(resolution?: AceStepResolution): Promise<AceStepSetupStatus> {
    const { aceStep, aceStepModels } = this.deps.locations();
    const resolved = resolution ?? (await this.deps.resolve());
    const managed = aceStep ? await aceStepInstallStatus(aceStep) : { installed: false };
    // The provider runs the binary it resolved, which may be the managed one
    // or one the user's settings or PATH name.
    const installed = managed.installed || resolved.binary !== null;
    const blocked = installed ? null : this.installBlock(aceStep);
    const modelsDir = resolved.modelsDir ?? aceStepModels;
    const sets = {} as Record<AceStepModelSet, AceStepSetupStatus["models"]["first_run"]>;
    for (const set of Object.keys(MODEL_SET_ROLES) as AceStepModelSet[]) {
      const roles = MODEL_SET_ROLES[set];
      const files = aceStepModelFiles(roles);
      const status = modelsDir
        ? await aceStepModelStatus(modelsDir, roles)
        : { present: [], missing: [...roles] };
      const missing = new Set(status.missing);
      sets[set] = {
        present: status.present,
        missing: status.missing,
        approx_bytes: files.reduce((sum, file) => sum + file.approxBytes, 0),
        missing_bytes: files
          .filter((file) => missing.has(file.role))
          .reduce((sum, file) => sum + file.approxBytes, 0)
      };
    }
    return {
      remote: resolved.remote,
      binary: {
        installed,
        version: ("version" in managed ? managed.version : undefined) ?? null,
        blocked: blocked?.code ?? null,
        message: blocked?.message ?? null
      },
      models: { ...sets, available: aceStepModels !== null },
      operation: this.operation
    };
  }

  async startInstall(resolution?: AceStepResolution): Promise<AceStepSetupResult> {
    const { aceStep } = this.deps.locations();
    const blocked = this.installBlock(aceStep);
    if (blocked || !aceStep) {
      return this.refuse("blocked", resolution);
    }
    if (this.running) {
      return this.refuse("busy", resolution);
    }
    this.begin("install", null, "Preparing the ACE-Step install");
    this.run(async (signal) => {
      await this.deps.install({
        installDir: aceStep,
        platform: this.deps.platform,
        arch: this.deps.arch,
        signal,
        onEvent: (event) => {
          if (event.type === "stage") {
            this.update({ stage: event.label });
          } else {
            this.update({ percent: Math.max(0, Math.min(100, event.value)) });
          }
        }
      });
    });
    return this.accept(resolution);
  }

  async startModelDownload(set: AceStepModelSet, resolution?: AceStepResolution): Promise<AceStepSetupResult> {
    const { aceStepModels } = this.deps.locations();
    if (!aceStepModels) {
      return this.refuse("no_models_dir", resolution);
    }
    if (this.running) {
      return this.refuse("busy", resolution);
    }
    this.begin("models", set, "Preparing the model download");
    this.run(async (signal) => {
      await this.deps.downloadModels({
        modelsDir: aceStepModels,
        roles: MODEL_SET_ROLES[set],
        signal,
        onProgress: (progress) => this.updateModels(progress)
      });
    });
    return this.accept(resolution);
  }

  async cancel(resolution?: AceStepResolution): Promise<AceStepSetupResult> {
    if (!this.running || !this.controller) {
      return this.refuse("nothing_running", resolution);
    }
    this.controller.abort(new Error("ACE-Step setup cancelled"));
    return this.accept(resolution);
  }

  /** The reason an install cannot start, or null when it can. */
  private installBlock(
    aceStep: string | null
  ): { code: "unsupported-platform" | "digest-unset" | "no-install-dir"; message: string } | null {
    if (!aceStep) {
      return {
        code: "no-install-dir",
        message: "This server has no install folder for ace-server. Set ACESTEP_SERVER_PATH or ACESTEP_SERVER_URL."
      };
    }
    const asset = this.deps.asset(this.deps.platform, this.deps.arch);
    if (!asset) {
      return {
        code: "unsupported-platform",
        message: "NodeTool builds ace-server for macOS on Apple silicon only. Set ACESTEP_SERVER_PATH or ACESTEP_SERVER_URL."
      };
    }
    if (!asset.sha256) {
      return {
        code: "digest-unset",
        message: "This NodeTool build has no ace-server release to install yet. Set ACESTEP_SERVER_PATH or ACESTEP_SERVER_URL."
      };
    }
    return null;
  }

  private begin(kind: "install" | "models", set: AceStepModelSet | null, stage: string): void {
    const operation: AceStepSetupOperation = {
      id: randomUUID().replaceAll("-", ""),
      kind,
      set,
      state: "running",
      stage,
      percent: null,
      downloaded_bytes: 0,
      total_bytes: 0,
      file: null,
      file_index: 0,
      file_count: 0,
      error: null,
      error_code: null
    };
    this.operation = operation;
    this.controller = new AbortController();
    this.emit();
  }

  private run(work: (signal: AbortSignal) => Promise<void>): void {
    const controller = this.controller;
    if (!controller) {
      throw new Error("An ACE-Step setup operation starts with begin()");
    }
    this.running = work(controller.signal)
      .then(() => {
        this.update({ state: "done", percent: 100, stage: "Done" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          this.update({ state: "cancelled", stage: "Cancelled" });
          return;
        }
        this.update({
          state: "failed",
          stage: "Failed",
          error: error instanceof Error ? error.message : String(error),
          error_code: error instanceof AceStepInstallError ? error.code : null
        });
      })
      .finally(() => {
        this.running = null;
        this.controller = null;
      });
  }

  private updateModels(progress: AceStepModelProgress): void {
    this.update({
      stage: `Downloading ${progress.file}`,
      file: progress.file,
      file_index: progress.fileIndex,
      file_count: progress.fileCount,
      downloaded_bytes: progress.downloadedBytes,
      total_bytes: progress.totalBytes,
      percent: progress.totalBytes > 0 ? Math.min(100, (progress.downloadedBytes / progress.totalBytes) * 100) : null
    });
  }

  private update(patch: Partial<AceStepSetupOperation>): void {
    if (!this.operation) {
      return;
    }
    this.operation = { ...this.operation, ...patch };
    this.emit();
  }

  private emit(): void {
    const operation = this.operation;
    if (!operation) {
      return;
    }
    for (const listener of this.listeners) {
      listener(operation);
    }
  }

  private async accept(resolution: AceStepResolution | undefined): Promise<AceStepSetupResult> {
    return { accepted: true, reason: null, status: await this.status(resolution) };
  }

  private async refuse(reason: Refusal, resolution: AceStepResolution | undefined): Promise<AceStepSetupResult> {
    return { accepted: false, reason, status: await this.status(resolution) };
  }
}

let shared: AceStepSetupService | null = null;

/** The server-wide service the WebSocket commands use. */
export function aceStepSetupService(): AceStepSetupService {
  shared ??= new AceStepSetupService();
  return shared;
}
