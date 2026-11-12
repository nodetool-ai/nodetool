/**
 * First-run setup of ACE-Step music mode, exposed to clients through the
 * `acestep_*` WebSocket commands (MUSIC-MODE.md section 12.4).
 *
 * The service reports whether `ace-server` and the model files are on disk,
 * installs the pinned binary and downloads a named set of model files. It
 * holds one operation at a time for the whole server, so a client that
 * reconnects mid-download reads the same progress from `status()`.
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
  /** The `ACESTEP_SERVER_URL` setting, read when status is built. */
  remoteUrl: () => string | undefined;
  /** The release archive for a platform. Tests supply one with a digest. */
  asset: typeof aceStepAsset;
  install: typeof installAceStep;
  downloadModels: typeof downloadAceStepModels;
}

const defaultDeps = (): AceStepSetupDeps => ({
  locations: () => runtimeLocations(),
  platform: process.platform,
  arch: process.arch,
  remoteUrl: () => process.env.ACESTEP_SERVER_URL,
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

  async status(): Promise<AceStepSetupStatus> {
    const { aceStep, aceStepModels } = this.deps.locations();
    const installed = aceStep ? await aceStepInstallStatus(aceStep) : { installed: false };
    const blocked = installed.installed ? null : this.installBlock(aceStep);
    const sets = {} as Record<AceStepModelSet, AceStepSetupStatus["models"]["first_run"]>;
    for (const set of Object.keys(MODEL_SET_ROLES) as AceStepModelSet[]) {
      const roles = MODEL_SET_ROLES[set];
      const files = aceStepModelFiles(roles);
      const status = aceStepModels
        ? await aceStepModelStatus(aceStepModels, roles)
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
      remote: Boolean(this.deps.remoteUrl()?.trim()),
      binary: {
        installed: installed.installed,
        version: ("version" in installed ? installed.version : undefined) ?? null,
        blocked: blocked?.code ?? null,
        message: blocked?.message ?? null
      },
      models: { ...sets, available: aceStepModels !== null },
      operation: this.operation
    };
  }

  async startInstall(): Promise<AceStepSetupResult> {
    const { aceStep } = this.deps.locations();
    const blocked = this.installBlock(aceStep);
    if (blocked || !aceStep) {
      return this.refuse("blocked");
    }
    if (this.running) {
      return this.refuse("busy");
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
    return this.accept();
  }

  async startModelDownload(set: AceStepModelSet): Promise<AceStepSetupResult> {
    const { aceStepModels } = this.deps.locations();
    if (!aceStepModels) {
      return this.refuse("no_models_dir");
    }
    if (this.running) {
      return this.refuse("busy");
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
    return this.accept();
  }

  async cancel(): Promise<AceStepSetupResult> {
    if (!this.running || !this.controller) {
      return this.refuse("nothing_running");
    }
    this.controller.abort(new Error("ACE-Step setup cancelled"));
    return this.accept();
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

  private async accept(): Promise<AceStepSetupResult> {
    return { accepted: true, reason: null, status: await this.status() };
  }

  private async refuse(reason: Refusal): Promise<AceStepSetupResult> {
    return { accepted: false, reason, status: await this.status() };
  }
}

let shared: AceStepSetupService | null = null;

/** The server-wide service the WebSocket commands use. */
export function aceStepSetupService(): AceStepSetupService {
  shared ??= new AceStepSetupService();
  return shared;
}
