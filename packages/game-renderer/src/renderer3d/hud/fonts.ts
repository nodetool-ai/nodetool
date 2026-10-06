import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import { gameFontFamily } from "../../fonts.js";
import type { CreateGameRenderer3DOptions } from "../index.js";

export class GameFonts3D {
  private readonly fonts = new Map<string, FontFace>();
  private readonly optionalFonts = new Set<string>();
  constructor(private readonly options: CreateGameRenderer3DOptions, private readonly controller: AbortController,
    private readonly diagnostics: string[]) {}
  async load(frame: GameRenderFrame3D): Promise<void> {
    const present = new Set(Object.entries(frame.fonts ?? {}).map(([id, binding]) => JSON.stringify([frame.gameId, id, binding])));
    for (const [key, face] of this.fonts) {
      if (!present.has(key)) { document.fonts.delete(face); this.fonts.delete(key); }
    }
    for (const key of this.optionalFonts) {
      if (!present.has(key)) { this.optionalFonts.delete(key); }
    }
    for (const [id, binding] of Object.entries(frame.fonts ?? {})) {
      const key = JSON.stringify([frame.gameId, id, binding]);
      if (this.fonts.has(key) || this.optionalFonts.has(key)) { continue; }
      try {
        const source = await this.options.resolveFont?.(id, this.controller.signal);
        this.controller.signal.throwIfAborted();
        if (!source) { throw new Error("asset is missing"); }
        if (source.bytes.length > 16 * 1024 * 1024) { throw new Error("font exceeds 16 MiB"); }
        const bytes = new Uint8Array(source.bytes);
        const hashed = await crypto.subtle.digest("SHA-256", bytes);
        const digest = Array.from(new Uint8Array(hashed), (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (digest !== binding.digest) { throw new Error("font digest changed"); }
        const face = await new FontFace(gameFontFamily(frame.gameId, id), bytes.buffer).load();
        this.controller.signal.throwIfAborted();
        document.fonts.add(face);
        this.fonts.set(key, face);
      } catch (error) {
        this.controller.signal.throwIfAborted();
        const message = `${binding.required ? "Required" : "Optional"} font ${id} could not load: ${error instanceof Error ? error.message : "invalid font"}`;
        if (binding.required) { throw new Error(message, { cause: error }); }
        this.optionalFonts.add(key);
        this.diagnostics.push(message);
        this.options.onDiagnostic?.(message);
      }
    }
  }
  dispose(): void {
    this.fonts.forEach((face) => document.fonts.delete(face));
    this.fonts.clear();
    this.optionalFonts.clear();
  }
}
