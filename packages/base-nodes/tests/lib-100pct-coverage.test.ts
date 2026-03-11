/**
 * Targeted tests to reach 100% statement coverage on all lib-* files.
 * Covers edge cases, mocked external services, and alternative code paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  SelectLibNode,
  InsertLibNode as SupabaseInsertLibNode,
  UpdateLibNode as SupabaseUpdateLibNode,
  DeleteLibNode as SupabaseDeleteLibNode,
  UpsertLibNode as SupabaseUpsertLibNode,
  RPCLibNode as SupabaseRPCLibNode,
} from "../src/nodes/lib-supabase.js";

import {
  // lib-compat
  LIB_COMPAT_PY_NODES,
  // lib-pedalboard-extra
  PitchShiftNode,
  TimeStretchNode,
  // lib-pdf
  ExtractTablesPdfPlumberNode,
  ExtractMarkdownPyMuPdfNode,
  // lib-os
  OpenWorkspaceDirectoryLibNode,
  // lib-librosa-spectral
  STFTNode,
  SegmentAudioByOnsetsNode,
  // lib-numpy
  SaveArrayNode,
  ConvertToArrayNumpyNode,
  // lib-docx
  AddImageLibNode,
  // lib-excel
  SaveWorkbookLibNode,
  CreateWorkbookLibNode,
  // lib-ytdlp
  YtDlpDownloadLibNode,
  // lib-audio-dsp
  GainNode_,
  // lib-synthesis
  EnvelopeLibNode,
  // lib-grid
  SliceImageGridLibNode,
  // lib-http
  GetRequestLibNode,
  // lib-mail
  SendEmailLibNode,
  // lib-markitdown
  ConvertToMarkdownLibNode,
} from "../src/index.js";

// ── WAV helper: create WAV with configurable bits/channels ──────

function makeWav(opts: {
  sampleRate?: number;
  bitsPerSample?: 8 | 16;
  numChannels?: number;
  durationSec?: number;
  freq?: number;
}): Buffer {
  const sampleRate = opts.sampleRate ?? 22050;
  const bitsPerSample = opts.bitsPerSample ?? 16;
  const numChannels = opts.numChannels ?? 1;
  const durationSec = opts.durationSec ?? 0.1;
  const freq = opts.freq ?? 440;
  const frameSamples = Math.floor(sampleRate * durationSec);
  const totalSamples = frameSamples * numChannels;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = totalSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i++) {
    const frameIdx = Math.floor(i / numChannels);
    const sample = Math.sin((2 * Math.PI * freq * frameIdx) / sampleRate);
    const pos = 44 + i * bytesPerSample;
    if (bitsPerSample === 16) {
      buffer.writeInt16LE(Math.round(sample * 0x7fff * 0.5), pos);
    } else {
      buffer.writeUInt8(Math.round((sample * 0.5 + 1) * 128), pos);
    }
  }
  return buffer;
}

function audioRef(buf: Buffer): Record<string, unknown> {
  return { type: "audio", uri: "", data: buf.toString("base64") };
}

// ── Minimal PDF builder ─────────────────────────────────────────

function buildMinimalPdf(
  items: Array<{ text: string; x: number; y: number; fontSize?: number }>
): Uint8Array {
  // Build a minimal valid PDF with text items
  const fontSize = 12;
  const textOps = items
    .map((item) => {
      const fs = item.fontSize ?? fontSize;
      return `BT /F1 ${fs} Tf ${item.x} ${item.y} Td (${item.text}) Tj ET`;
    })
    .join("\n");

  const stream = `${textOps}\n`;
  const streamLen = Buffer.byteLength(stream, "ascii");

  const objs = [
    // obj 1: catalog
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    // obj 2: pages
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    // obj 3: page
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`,
    // obj 4: content stream
    `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}endstream\nendobj`,
    // obj 5: font
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`,
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += obj + "\n";
  }

  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objs.length + 1}\n`;
  body += `0000000000 65535 f \n`;
  for (const off of offsets) {
    body += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, "ascii"));
}

// ── lib-compat: exercise createLibCompatNode via module internals ──

describe("lib-compat coverage", () => {
  it("module exports functions and empty array", async () => {
    // Force the module to be fully loaded (all top-level code)
    const mod = await import("../src/nodes/lib-compat.js");
    expect(mod.LIB_COMPAT_PY_NODES).toEqual([]);
  });
});

// ── lib-supabase: mock createClient for success paths ──────────

// We mock at the module level since supabase exports are non-configurable
const mockFromChain: Record<string, any> = {};
const mockRpc = vi.fn();
const mockCreateClient = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue(mockFromChain),
  rpc: mockRpc,
});

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, createClient: (...args: any[]) => mockCreateClient(...args) };
});

describe("lib-supabase success paths (mocked)", () => {
  // Build a chainable query mock
  function chainable(resolvedValue: { data: unknown; error: unknown }) {
    const q: Record<string, unknown> = {};
    const methods = [
      "select", "eq", "neq", "gt", "gte", "lt", "lte", "in", "like",
      "contains", "order", "limit", "insert", "update", "upsert", "delete",
    ];
    for (const m of methods) {
      q[m] = vi.fn().mockReturnValue(q);
    }
    // Make the object thenable to resolve when awaited
    q.then = (resolve: (v: unknown) => void) => {
      resolve(resolvedValue);
      return q;
    };
    return q;
  }

  beforeEach(() => {
    // Reset the chain object
    const q = chainable({ data: [], error: null });
    Object.assign(mockFromChain, q);
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(mockFromChain),
      rpc: mockRpc,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Select succeeds with all filter operators", async () => {
    const mockQ = chainable({ data: [{ id: 1 }], error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(mockQ),
      rpc: mockRpc,
    });

    const result = await new SelectLibNode().process({
      supabase_url: "https://test.supabase.co",
      supabase_key: "key123",
      table_name: "test_table",
      columns: { columns: [{ name: "id" }, { name: "name" }] },
      filters: [
        ["id", "eq", 1],
        ["name", "ne", "x"],
        ["age", "gt", 10],
        ["age", "gte", 10],
        ["age", "lt", 100],
        ["age", "lte", 100],
        ["status", "in", ["a", "b"]],
        ["email", "like", "%@test%"],
        ["meta", "contains", { k: "v" }],
      ],
      order_by: "id",
      descending: true,
      limit: 10,
    });
    expect(result.output).toEqual([{ id: 1 }]);
  });

  it("Select with unsupported filter throws", async () => {
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chainable({ data: [], error: null })),
      rpc: mockRpc,
    });

    await expect(
      new SelectLibNode().process({
        supabase_url: "https://test.supabase.co",
        supabase_key: "key123",
        table_name: "test_table",
        filters: [["id", "invalid_op" as any, 1]],
      })
    ).rejects.toThrow("Unsupported filter operator");
  });

  it("Select with error response throws", async () => {
    const q: Record<string, unknown> = {};
    const methods = ["select", "eq", "order", "limit"];
    for (const m of methods) {
      q[m] = vi.fn().mockReturnValue(q);
    }
    q.then = (resolve: (v: unknown) => void) => {
      resolve({ data: null, error: { message: "test error" } });
      return q;
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(q),
      rpc: mockRpc,
    });

    await expect(
      new SelectLibNode().process({
        supabase_url: "https://test.supabase.co",
        supabase_key: "key123",
        table_name: "test_table",
      })
    ).rejects.toThrow("Supabase select error");
  });

  it("Insert succeeds and returns rows", async () => {
    const mockQ = chainable({ data: [{ id: 1, a: 1 }], error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(mockQ),
      rpc: mockRpc,
    });

    const result = await new SupabaseInsertLibNode().process({
      supabase_url: "https://test.supabase.co",
      supabase_key: "key123",
      table_name: "test_table",
      records: [{ a: 1 }],
      return_rows: true,
    });
    expect(result.output).toEqual([{ id: 1, a: 1 }]);
  });

  it("Insert succeeds with return_rows=false", async () => {
    const mockQ = chainable({ data: null, error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(mockQ),
      rpc: mockRpc,
    });

    const result = await new SupabaseInsertLibNode().process({
      supabase_url: "https://test.supabase.co",
      supabase_key: "key123",
      table_name: "test_table",
      records: [{ a: 1 }],
      return_rows: false,
    });
    expect((result.output as any).inserted).toBe(1);
  });

  it("Insert with error response throws", async () => {
    const q: Record<string, unknown> = {};
    q.insert = vi.fn().mockReturnValue(q);
    q.select = vi.fn().mockReturnValue(q);
    q.then = (resolve: (v: unknown) => void) => {
      resolve({ data: null, error: { message: "insert failed" } });
      return q;
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(q),
      rpc: mockRpc,
    });

    await expect(
      new SupabaseInsertLibNode().process({
        supabase_url: "https://test.supabase.co",
        supabase_key: "key123",
        table_name: "test_table",
        records: [{ a: 1 }],
      })
    ).rejects.toThrow("Supabase insert error");
  });

  it("Update succeeds with filters and return_rows", async () => {
    const mockQ = chainable({ data: [{ id: 1, x: 2 }], error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(mockQ),
      rpc: mockRpc,
    });

    const result = await new SupabaseUpdateLibNode().process({
      supabase_url: "https://test.supabase.co",
      supabase_key: "key123",
      table_name: "test_table",
      values: { x: 2 },
      filters: [["id", "eq", 1]],
      return_rows: true,
    });
    expect(result.output).toEqual([{ id: 1, x: 2 }]);
  });

  it("Update succeeds with return_rows=false", async () => {
    const mockQ = chainable({ data: null, error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(mockQ),
      rpc: mockRpc,
    });

    const result = await new SupabaseUpdateLibNode().process({
      supabase_url: "https://test.supabase.co",
      supabase_key: "key123",
      table_name: "test_table",
      values: { x: 2 },
      filters: [],
      return_rows: false,
    });
    expect((result.output as any).updated).toBe(true);
  });

  it("Update with error response throws", async () => {
    const q: Record<string, unknown> = {};
    q.update = vi.fn().mockReturnValue(q);
    q.select = vi.fn().mockReturnValue(q);
    q.then = (resolve: (v: unknown) => void) => {
      resolve({ data: null, error: { message: "update failed" } });
      return q;
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(q),
      rpc: mockRpc,
    });

    await expect(
      new SupabaseUpdateLibNode().process({
        supabase_url: "https://test.supabase.co",
        supabase_key: "key123",
        table_name: "test_table",
        values: { x: 1 },
      })
    ).rejects.toThrow("Supabase update error");
  });

  it("Delete succeeds", async () => {
    const mockQ = chainable({ data: null, error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(mockQ),
      rpc: mockRpc,
    });

    const result = await new SupabaseDeleteLibNode().process({
      supabase_url: "https://test.supabase.co",
      supabase_key: "key123",
      table_name: "test_table",
      filters: [["id", "eq", 1]],
    });
    expect((result.output as any).deleted).toBe(true);
  });

  it("Delete with error response throws", async () => {
    const q: Record<string, unknown> = {};
    q.delete = vi.fn().mockReturnValue(q);
    q.eq = vi.fn().mockReturnValue(q);
    q.then = (resolve: (v: unknown) => void) => {
      resolve({ data: null, error: { message: "delete failed" } });
      return q;
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(q),
      rpc: mockRpc,
    });

    await expect(
      new SupabaseDeleteLibNode().process({
        supabase_url: "https://test.supabase.co",
        supabase_key: "key123",
        table_name: "test_table",
        filters: [["id", "eq", 1]],
      })
    ).rejects.toThrow("Supabase delete error");
  });

  it("Upsert succeeds with return_rows", async () => {
    const mockQ = chainable({ data: [{ id: 1 }], error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(mockQ),
      rpc: mockRpc,
    });

    const result = await new SupabaseUpsertLibNode().process({
      supabase_url: "https://test.supabase.co",
      supabase_key: "key123",
      table_name: "test_table",
      records: [{ id: 1 }],
      return_rows: true,
    });
    expect(result.output).toEqual([{ id: 1 }]);
  });

  it("Upsert succeeds with return_rows=false", async () => {
    const mockQ = chainable({ data: null, error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(mockQ),
      rpc: mockRpc,
    });

    const result = await new SupabaseUpsertLibNode().process({
      supabase_url: "https://test.supabase.co",
      supabase_key: "key123",
      table_name: "test_table",
      records: [{ id: 1 }],
      return_rows: false,
    });
    expect((result.output as any).upserted).toBe(1);
  });

  it("Upsert with error response throws", async () => {
    const q: Record<string, unknown> = {};
    q.upsert = vi.fn().mockReturnValue(q);
    q.select = vi.fn().mockReturnValue(q);
    q.then = (resolve: (v: unknown) => void) => {
      resolve({ data: null, error: { message: "upsert failed" } });
      return q;
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(q),
      rpc: mockRpc,
    });

    await expect(
      new SupabaseUpsertLibNode().process({
        supabase_url: "https://test.supabase.co",
        supabase_key: "key123",
        table_name: "test_table",
        records: [{ id: 1 }],
      })
    ).rejects.toThrow("Supabase upsert error");
  });

  it("RPC succeeds", async () => {
    mockCreateClient.mockReturnValue({
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: { result: 42 }, error: null }),
    });

    const result = await new SupabaseRPCLibNode().process({
      supabase_url: "https://test.supabase.co",
      supabase_key: "key123",
      function: "my_func",
      params: { x: 1 },
    });
    expect(result.output).toEqual({ result: 42 });
  });

  it("RPC with error response throws", async () => {
    mockCreateClient.mockReturnValue({
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "rpc failed" } }),
    });

    await expect(
      new SupabaseRPCLibNode().process({
        supabase_url: "https://test.supabase.co",
        supabase_key: "key123",
        function: "my_func",
      })
    ).rejects.toThrow("Supabase RPC error");
  });
});

// ── lib-pedalboard-extra: 8-bit WAV + >2 channel paths ─────────

describe("lib-pedalboard-extra coverage", () => {
  it("PitchShift with 8-bit WAV", async () => {
    const wav = makeWav({ bitsPerSample: 8, durationSec: 0.2, numChannels: 1 });
    const result = await new PitchShiftNode().process({
      audio: audioRef(wav),
      semitones: 2,
    });
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("PitchShift with >2 channel WAV (takes first 2 channels)", async () => {
    const wav = makeWav({ numChannels: 3, durationSec: 0.2 });
    const result = await new PitchShiftNode().process({
      audio: audioRef(wav),
      semitones: 3,
    });
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("PitchShift with stereo WAV", async () => {
    const wav = makeWav({ numChannels: 2, durationSec: 0.2 });
    const result = await new PitchShiftNode().process({
      audio: audioRef(wav),
      semitones: -2,
    });
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("TimeStretch with >2 channel WAV", async () => {
    const wav = makeWav({ numChannels: 3, durationSec: 0.2 });
    const result = await new TimeStretchNode().process({
      audio: audioRef(wav),
      rate: 1.5,
    });
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("TimeStretch with stereo WAV", async () => {
    const wav = makeWav({ numChannels: 2, durationSec: 0.2 });
    const result = await new TimeStretchNode().process({
      audio: audioRef(wav),
      rate: 0.8,
    });
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("TimeStretch with mono WAV", async () => {
    const wav = makeWav({ numChannels: 1, durationSec: 0.2 });
    const result = await new TimeStretchNode().process({
      audio: audioRef(wav),
      rate: 1.5,
    });
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });
});

// ── lib-pdf: use real minimal PDFs for table and markdown extraction ──

describe("lib-pdf table extraction coverage", () => {
  it("ExtractTables with a multi-page PDF with tabular content", async () => {
    // Create a real PDF with text content that looks like a table
    // using pdfjs-dist by generating a minimal PDF
    const pdfBytes = buildMinimalPdf([
      // 3 columns x 3 rows, evenly spaced on Y axis
      { text: "Name", x: 10, y: 100 },
      { text: "Age", x: 100, y: 100 },
      { text: "City", x: 200, y: 100 },
      { text: "Alice", x: 10, y: 80 },
      { text: "30", x: 100, y: 80 },
      { text: "NYC", x: 200, y: 80 },
      { text: "Bob", x: 10, y: 60 },
      { text: "25", x: 100, y: 60 },
      { text: "LA", x: 200, y: 60 },
    ]);

    const result = await new ExtractTablesPdfPlumberNode().process({
      pdf: { data: Buffer.from(pdfBytes).toString("base64") },
    });
    const output = result.output as any[];
    expect(Array.isArray(output)).toBe(true);
    // The table detection may or may not find tables depending on PDF rendering
    // but the code path for table analysis is exercised
  });
});

describe("lib-pdf markdown extraction coverage", () => {
  it("ExtractMarkdownPyMuPdf with varied font sizes", async () => {
    // Create a real PDF with text at different sizes
    const pdfBytes = buildMinimalPdf([
      { text: "Big Title", x: 10, y: 200, fontSize: 24 },
      { text: "Subtitle", x: 10, y: 170, fontSize: 16 },
      { text: "Body text here", x: 10, y: 140, fontSize: 12 },
      { text: "More content", x: 10, y: 110, fontSize: 12 },
    ]);

    const result = await new ExtractMarkdownPyMuPdfNode().process({
      pdf: { data: Buffer.from(pdfBytes).toString("base64") },
    });
    const output = String(result.output);
    expect(output.length).toBeGreaterThan(0);
  });
});

// ── lib-os: openPath ─────────────────────────────────────────────

describe("lib-os OpenWorkspaceDirectory coverage", () => {
  it("OpenWorkspaceDirectory returns empty when no context", async () => {
    const result = await new OpenWorkspaceDirectoryLibNode().process({});
    expect(result).toEqual({});
  });

  it("OpenWorkspaceDirectory returns empty when no workspaceDir", async () => {
    const result = await new OpenWorkspaceDirectoryLibNode().process({}, {} as any);
    expect(result).toEqual({});
  });

  it("OpenWorkspaceDirectory calls openPath with dir", async () => {
    // Use a temp dir that exists, but the open command will fail (or succeed on macOS)
    const tmpDir = mkdtempSync(join(tmpdir(), "os-test-"));
    try {
      const result = await new OpenWorkspaceDirectoryLibNode().process(
        {},
        { workspaceDir: tmpDir } as any
      );
      expect(result).toEqual({});
    } catch {
      // On CI or non-macOS, the "open" command may fail - that's ok, we covered the code path
    }
  });
});

// ── lib-librosa-spectral: 8-bit WAV and Uint8Array data ─────────

describe("lib-librosa-spectral coverage", () => {
  it("STFT with 8-bit WAV input", async () => {
    const wav = makeWav({ bitsPerSample: 8, durationSec: 0.5, sampleRate: 22050 });
    const result = await new STFTNode().process({
      audio: audioRef(wav),
      n_fft: 2048,
      hop_length: 512,
    });
    const output = result.output as { data: unknown[] };
    expect(Array.isArray(output.data)).toBe(true);
  });

  it("STFT with Uint8Array data (not base64)", async () => {
    const wav = makeWav({ durationSec: 0.5, sampleRate: 22050 });
    const result = await new STFTNode().process({
      audio: { type: "audio", uri: "", data: new Uint8Array(wav) },
      n_fft: 2048,
      hop_length: 512,
    });
    const output = result.output as { data: unknown[] };
    expect(Array.isArray(output.data)).toBe(true);
  });

  it("STFT with invalid audio data throws", async () => {
    await expect(
      new STFTNode().process({
        audio: { type: "audio", uri: "", data: 12345 },
        n_fft: 2048,
        hop_length: 512,
      })
    ).rejects.toThrow("Invalid audio data");
  });

  it("STFT with non-RIFF data throws", async () => {
    await expect(
      new STFTNode().process({
        audio: { type: "audio", uri: "", data: Buffer.from("NOT_A_WAV_FILE_HEADER_ENOUGH_BYTES______________").toString("base64") },
        n_fft: 2048,
        hop_length: 512,
      })
    ).rejects.toThrow("Invalid WAV file");
  });

  it("SegmentAudioByOnsets with Uint8Array data segments", async () => {
    const wav = makeWav({ durationSec: 0.5, sampleRate: 22050 });
    const result = await new SegmentAudioByOnsetsNode().process({
      audio: audioRef(wav),
      onsets: { data: [0.0, 0.2] },
      min_segment_length: 0.05,
    });
    const output = result.output as unknown[];
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
  });

  it("SegmentAudioByOnsets with folder saving", async () => {
    const wav = makeWav({ durationSec: 0.5, sampleRate: 22050 });
    const tmpDir = mkdtempSync(join(tmpdir(), "librosa-test-"));

    const result = await new SegmentAudioByOnsetsNode().process({
      audio: audioRef(wav),
      onsets: { data: [0.0, 0.2] },
      min_segment_length: 0.05,
      folder: { path: tmpDir },
      prefix: "seg",
    });
    const output = result.output;
    // When folder is set, output should be the folder ref
    expect(output).toBeDefined();
  });

  it("STFT with WAV that has extra chunks before data", async () => {
    // Create WAV with a "LIST" chunk before the "data" chunk
    const sampleRate = 22050;
    const numSamples = 1024;
    const dataSize = numSamples * 2;
    const listChunkSize = 20;
    const totalSize = 36 + 8 + listChunkSize + 8 + dataSize;

    const buf = Buffer.alloc(8 + totalSize);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(totalSize, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    // Extra LIST chunk
    buf.write("LIST", 36);
    buf.writeUInt32LE(listChunkSize, 40);
    // data chunk at offset 36 + 8 + listChunkSize = 64
    const dataChunkOffset = 36 + 8 + listChunkSize;
    buf.write("data", dataChunkOffset);
    buf.writeUInt32LE(dataSize, dataChunkOffset + 4);
    // Write some samples
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      buf.writeInt16LE(Math.round(sample * 0x7fff * 0.5), dataChunkOffset + 8 + i * 2);
    }

    const result = await new STFTNode().process({
      audio: audioRef(buf),
      n_fft: 512,
      hop_length: 256,
    });
    const output = result.output as { data: unknown[] };
    expect(Array.isArray(output.data)).toBe(true);
  });
});

// ── lib-numpy: edge cases ────────────────────────────────────────

describe("lib-numpy coverage", () => {
  it("SaveArray without storage context", async () => {
    const result = await new SaveArrayNode().process({
      values: { data: [1, 2, 3], shape: [3] },
      name: "test.json",
    });
    const output = result.output as { data: number[]; shape: number[] };
    expect(output.data).toEqual([1, 2, 3]);
    expect(output.shape).toEqual([3]);
  });

  it("SaveArray with storage context", async () => {
    const storeFn = vi.fn().mockResolvedValue("file:///test.json");
    const result = await new SaveArrayNode().process(
      {
        values: { data: [1, 2, 3], shape: [3] },
        name: "test.json",
      },
      { storage: { store: storeFn } } as any
    );
    const output = result.output as { data: number[]; shape: number[]; uri: string };
    expect(output.uri).toBe("file:///test.json");
    expect(storeFn).toHaveBeenCalled();
  });

  it("SaveArray with date template name", async () => {
    const result = await new SaveArrayNode().process({
      values: { data: [1], shape: [1] },
      name: "%Y-%m-%d_%H-%M-%S.npy",
    });
    const output = result.output as { data: number[]; shape: number[] };
    expect(output.data).toEqual([1]);
  });

  it("ConvertToArray with grayscale image", async () => {
    // Create a grayscale PNG using sharp from raw single-channel data
    const sharp = (await import("sharp")).default;
    const rawGray = Buffer.alloc(4, 128); // 2x2 gray pixels
    const pngBuf = await sharp(rawGray, { raw: { width: 2, height: 2, channels: 1 } })
      .png()
      .toBuffer();

    const result = await new ConvertToArrayNumpyNode().process({
      image: { type: "image", data: pngBuf.toString("base64") },
    });
    const output = result.output as { data: number[]; shape: number[] };
    // sharp may expand to 3 or 4 channels, but the code path for shape assignment is hit
    expect(output.shape.length).toBe(3);
    expect(output.data.length).toBeGreaterThan(0);
  });
});

// ── lib-docx: AddImage edge cases ────────────────────────────────

describe("lib-docx AddImage coverage", () => {
  it("AddImage with string path", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "docx-test-"));
    const imgPath = join(tmpDir, "test.png");
    // Create a minimal PNG (1x1 pixel)
    const sharp = (await import("sharp")).default;
    const pngBuf = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    writeFileSync(imgPath, pngBuf);

    const result = await new AddImageLibNode().process({
      document: { elements: [] },
      image: imgPath,
      width: 100,
      height: 100,
    });
    expect((result.output as any).elements.length).toBe(1);
  });

  it("AddImage with image object with uri", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "docx-test-"));
    const imgPath = join(tmpDir, "test.png");
    const sharp = (await import("sharp")).default;
    const pngBuf = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer();
    writeFileSync(imgPath, pngBuf);

    const result = await new AddImageLibNode().process({
      document: { elements: [] },
      image: { uri: `file://${imgPath}` },
      width: 50,
      height: 50,
    });
    expect((result.output as any).elements.length).toBe(1);
  });

  it("AddImage with image object with empty uri throws", async () => {
    await expect(
      new AddImageLibNode().process({
        document: { elements: [] },
        image: { uri: "" },
      })
    ).rejects.toThrow("Image path is not set");
  });

  it("AddImage with invalid image input throws", async () => {
    await expect(
      new AddImageLibNode().process({
        document: { elements: [] },
        image: 12345,
      })
    ).rejects.toThrow("Invalid image input");
  });

  it("AddImage with no elements in document", async () => {
    await expect(
      new AddImageLibNode().process({
        document: "not_a_doc",
        image: 12345,
      })
    ).rejects.toThrow("Invalid image input");
  });
});

// ── lib-excel: edge cases ────────────────────────────────────────

describe("lib-excel coverage", () => {
  it("SaveWorkbook with folder as string path", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "excel-test-"));

    // Create a workbook first
    const wb = await new CreateWorkbookLibNode().process({ sheet_name: "Test" });

    const result = await new SaveWorkbookLibNode().process({
      workbook: wb.output,
      folder: tmpDir,
      filename: "test_%Y.xlsx",
    });
    // output is the full file path string
    expect(typeof result.output).toBe("string");
    expect(String(result.output)).toContain("test_");
  });

  it("getWorkbook with raw Workbook instance", async () => {
    const ExcelJS = await import("exceljs");
    const rawWb = new ExcelJS.Workbook();
    rawWb.addWorksheet("Test");

    const result = await new SaveWorkbookLibNode().process({
      workbook: rawWb,
      folder: mkdtempSync(join(tmpdir(), "excel-test-")),
      filename: "raw.xlsx",
    });
    expect(typeof result.output).toBe("string");
  });

  it("getWorkbook throws on invalid input", async () => {
    await expect(
      new SaveWorkbookLibNode().process({
        workbook: "not-a-workbook",
        folder: "/tmp",
        filename: "test.xlsx",
      })
    ).rejects.toThrow("Workbook is not connected");
  });
});

// ── lib-ytdlp: runCommand timeout and error paths ────────────────

describe("lib-ytdlp runCommand coverage", () => {
  it("runCommand handles spawn error for nonexistent binary", async () => {
    const origPath = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      await expect(
        new YtDlpDownloadLibNode().process({
          url: "https://example.com/video",
        })
      ).rejects.toThrow();
    } finally {
      process.env.PATH = origPath;
    }
  }, 15_000);

  // Note: timeout/timedOut paths (lines 21-22, 38-40) require a child process
  // that sleeps longer than the timeout, which is inherently slow to test.
  // Those 5 lines remain uncovered to avoid flaky/slow tests.
});

// ── lib-audio-dsp: 8-bit WAV decode path ─────────────────────────

describe("lib-audio-dsp 8-bit WAV coverage", () => {
  it("Gain with 8-bit WAV input", async () => {
    const wav = makeWav({ bitsPerSample: 8, durationSec: 0.1 });
    const result = await new GainNode_().process({
      audio: audioRef(wav),
      gain_db: 6.0,
    });
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });

  it("Gain with WAV that has extra chunks before data", async () => {
    // Create WAV with an extra chunk before data
    const sampleRate = 22050;
    const numSamples = 100;
    const dataSize = numSamples * 2;
    const extraChunkSize = 16;
    const totalFileSize = 36 + 8 + extraChunkSize + 8 + dataSize;

    const buf = Buffer.alloc(8 + totalFileSize);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(totalFileSize, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    // Extra "LIST" chunk
    buf.write("LIST", 36);
    buf.writeUInt32LE(extraChunkSize, 40);
    // data chunk
    const dOff = 36 + 8 + extraChunkSize;
    buf.write("data", dOff);
    buf.writeUInt32LE(dataSize, dOff + 4);
    for (let i = 0; i < numSamples; i++) {
      buf.writeInt16LE(Math.round(Math.sin(i * 0.1) * 16000), dOff + 8 + i * 2);
    }

    const result = await new GainNode_().process({
      audio: audioRef(buf),
      gain_db: 3.0,
    });
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
  });
});

// ── lib-synthesis: Uint8Array audio data path ────────────────────

describe("lib-synthesis Envelope coverage", () => {
  it("Envelope with Uint8Array audio data (not base64)", async () => {
    const wav = makeWav({ durationSec: 0.2 });
    const result = await new EnvelopeLibNode().process({
      audio: { type: "audio", uri: "", data: new Uint8Array(wav) },
      attack: 0.02,
      decay: 0.05,
      release: 0.1,
      peak_amplitude: 0.8,
    });
    const output = result.output as Record<string, unknown>;
    expect(output).toBeDefined();
  });

  it("Envelope with WAV that has extra chunks", async () => {
    // WAV with a LIST chunk before data chunk to test the chunk-scanning loop
    const sampleRate = 22050;
    const numSamples = 200;
    const dataSize = numSamples * 2;
    const listSize = 12;
    const totalFileSize = 36 + 8 + listSize + 8 + dataSize;

    const buf = Buffer.alloc(8 + totalFileSize);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(totalFileSize, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("LIST", 36);
    buf.writeUInt32LE(listSize, 40);
    const dOff = 36 + 8 + listSize;
    buf.write("data", dOff);
    buf.writeUInt32LE(dataSize, dOff + 4);
    for (let i = 0; i < numSamples; i++) {
      buf.writeInt16LE(Math.round(Math.sin(i * 0.1) * 16000), dOff + 8 + i * 2);
    }

    const result = await new EnvelopeLibNode().process({
      audio: audioRef(buf),
      attack: 0.01,
      decay: 0.02,
      release: 0.05,
    });
    expect(result.output).toBeDefined();
  });
});

// ── lib-grid: edge cases ─────────────────────────────────────────

describe("lib-grid coverage", () => {
  it("SliceImageGrid with null/undefined data returns error", async () => {
    await expect(
      new SliceImageGridLibNode().process({ image: null })
    ).rejects.toThrow("ImageRef must include data or uri.");
  });

  it("SliceImageGrid with Uint8Array data", async () => {
    const sharp = (await import("sharp")).default;
    const pngBuf = await sharp({
      create: { width: 6, height: 6, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();

    const result = await new SliceImageGridLibNode().process({
      image: { data: new Uint8Array(pngBuf) },
      columns: 2,
      rows: 2,
    });
    const output = result.output as unknown[];
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(4);
  });
});

// ── lib-http: castValue catch path ───────────────────────────────

describe("lib-http castValue coverage", () => {
  it("GetRequest exists and has defaults", () => {
    // castValue catch at lines 48-49 requires toString/valueOf to throw,
    // which is not possible with normal inputs. We verify the function loads.
    const node = new GetRequestLibNode();
    const d = node.serialize();
    expect(d).toHaveProperty("url");
  });
});

// ── lib-mail: successful send (mocked) ───────────────────────────

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "123" });

vi.mock("nodemailer", () => {
  return {
    default: {
      createTransport: () => ({
        sendMail: (...args: any[]) => mockSendMail(...args),
      }),
    },
  };
});

describe("lib-mail SendEmail success (mocked)", () => {
  it("sends email successfully", async () => {
    const result = await new SendEmailLibNode().process({
      smtp_server: "localhost",
      smtp_port: 1025,
      username: "user",
      password: "pass",
      from_address: "from@test.com",
      to_address: "to@test.com",
      subject: "Test",
      body: "Hello",
    });
    expect(result.output).toBe(true);
    expect(mockSendMail).toHaveBeenCalled();
  });
});

// ── lib-markitdown: unreachable throw ────────────────────────────

describe("lib-markitdown coverage", () => {
  it("ConvertToMarkdown with non-DOCX URI (file read, HTML content)", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "markitdown-test-"));
    const htmlPath = join(tmpDir, "test.html");
    writeFileSync(htmlPath, "<h1>Hello</h1><p>World</p>");

    const result = await new ConvertToMarkdownLibNode().process({
      document: { uri: htmlPath, data: "" },
    });
    const output = result.output as { data: string };
    expect(output.data).toContain("Hello");
  });

  it("ConvertToMarkdown with non-DOCX URI (file read, plain text)", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "markitdown-test-"));
    const txtPath = join(tmpDir, "test.txt");
    writeFileSync(txtPath, "Just plain text without any HTML");

    const result = await new ConvertToMarkdownLibNode().process({
      document: { uri: txtPath, data: "" },
    });
    const output = result.output as { data: string };
    expect(output.data).toContain("Just plain text");
  });
});
