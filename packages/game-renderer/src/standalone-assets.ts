interface StandaloneAssetBinding {
  readonly assetId: string;
  readonly digest: string;
  readonly mediaKind: string;
  readonly fontFormat?: string;
}

const FORMATS: Readonly<Record<string, readonly string[]>> = {
  image: ["png", "jpg", "jpeg", "webp"], font: ["ttf", "otf"], audio: ["wav", "ogg", "mp3"], model: ["glb"], collider: ["json"]
};
const MIME_TYPES: Readonly<Record<string, string>> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ttf: "font/ttf", otf: "font/otf",
  wav: "audio/wav", ogg: "audio/ogg", mp3: "audio/mpeg", glb: "model/gltf-binary", json: "application/json"
};

/** Owns verified local media and the Blob URLs used by offline player consumers. */
export class VerifiedStandaloneAssets {
  private readonly pending = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
  private readonly urls = new Map<string, string>();
  private readonly controller = new AbortController();
  private disposed = false;

  constructor(private readonly bindings: Readonly<Record<string, StandaloneAssetBinding>>,
    private readonly paths: Readonly<Record<string, string>>) {}

  private path(logicalId: string): string | null {
    const binding = Object.hasOwn(this.bindings, logicalId) ? this.bindings[logicalId] : undefined;
    if (!binding || binding.assetId.startsWith("builtin:")) { return null; }
    const path = Object.hasOwn(this.paths, logicalId) ? this.paths[logicalId] : undefined;
    if (!path || !/^\.\/assets\/[0-9a-f]{64}\.(?:png|jpg|jpeg|webp|ttf|otf|wav|ogg|mp3|glb|json)$/.test(path) ||
      !path.startsWith(`./assets/${binding.digest}.`)) {
      throw new Error(`Export asset ${logicalId} has no verified local path`);
    }
    const extension = path.slice(path.lastIndexOf(".") + 1);
    if (!FORMATS[binding.mediaKind]?.includes(extension) || (binding.mediaKind === "font" && binding.fontFormat !== extension)) {
      throw new Error(`Export asset ${logicalId} has a mismatched media format`);
    }
    return path;
  }

  private load(logicalId: string): Promise<Uint8Array<ArrayBuffer> | null> {
    if (this.disposed) { return Promise.reject(new Error("Export assets are disposed")); }
    const path = this.path(logicalId);
    if (!path) { return Promise.resolve(null); }
    const cached = this.pending.get(path);
    if (cached) { return cached; }
    const binding = this.bindings[logicalId];
    const pending = fetch(path, { signal: this.controller.signal, redirect: "error", cache: "no-cache" }).then(async (response) => {
      if (!response.ok) { throw new Error(`Export asset ${logicalId} could not load (${response.status})`); }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const digest = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (digest !== binding?.digest) { throw new Error(`Export asset ${logicalId} failed its digest check`); }
      this.controller.signal.throwIfAborted();
      return bytes;
    });
    this.pending.set(path, pending);
    void pending.catch(() => { if (this.pending.get(path) === pending) { this.pending.delete(path); } });
    return pending;
  }

  async verify(logicalId: string): Promise<void> { await this.load(logicalId); }

  async bytes(logicalId: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const bytes = await this.load(logicalId);
    this.controller.signal.throwIfAborted();
    return bytes?.slice() ?? null;
  }

  async url(logicalId: string): Promise<string | null> {
    const bytes = await this.load(logicalId);
    this.controller.signal.throwIfAborted();
    if (!bytes) { return null; }
    const path = this.path(logicalId);
    if (!path) { return null; }
    let url = this.urls.get(path);
    if (!url) {
      const extension = path.slice(path.lastIndexOf(".") + 1);
      try { url = URL.createObjectURL(new Blob([bytes], { type: MIME_TYPES[extension] })); }
      catch (cause: unknown) { throw new Error(`Verified media URL could not be created for ${logicalId}`, { cause }); }
      this.urls.set(path, url);
    }
    return url;
  }

  async bindingUrl(binding: StandaloneAssetBinding): Promise<string | null> {
    const logicalId = Object.keys(this.bindings).find((id) => this.bindings[id]?.assetId === binding.assetId && this.bindings[id]?.digest === binding.digest);
    return logicalId === undefined ? null : this.url(logicalId);
  }

  dispose(): void {
    this.disposed = true;
    this.controller.abort();
    for (const url of this.urls.values()) { URL.revokeObjectURL(url); }
    this.urls.clear();
    this.pending.clear();
  }
}
