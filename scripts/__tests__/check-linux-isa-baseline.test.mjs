import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkTree, instructionsAboveV2, isElfX64, isaLevelNeeded } from "../check-linux-isa-baseline.mjs";

const PT_LOAD = 1;
const PT_NOTE = 4;

/**
 * A minimal x86-64 ELF64 file with one PT_NOTE segment. `isaBits` sets the
 * X86_ISA_1_NEEDED property (1 baseline, 2 v2, 4 v3, 8 v4); null leaves the
 * note out. The property list starts with X86_FEATURE_1_AND, as GCC's does.
 */
function elf({ isaBits = null, machine = 62 } = {}) {
  const header = Buffer.alloc(64);
  header.writeUInt32LE(0x464c457f, 0);
  header[4] = 2;
  header[5] = 1;
  header[6] = 1;
  header.writeUInt16LE(3, 16);
  header.writeUInt16LE(machine, 18);
  header.writeUInt32LE(1, 20);
  header.writeBigUInt64LE(64n, 0x20);
  header.writeUInt16LE(64, 0x34);
  header.writeUInt16LE(56, 0x36);
  header.writeUInt16LE(2, 0x38);

  const properties = [];
  properties.push([0xc0000002, 3]);
  if (isaBits !== null) {
    properties.push([0xc0008002, isaBits]);
  }
  const desc = Buffer.alloc(properties.length * 16);
  properties.forEach(([type, value], i) => {
    desc.writeUInt32LE(type, i * 16);
    desc.writeUInt32LE(4, i * 16 + 4);
    desc.writeUInt32LE(value, i * 16 + 8);
  });
  const note = Buffer.alloc(16 + desc.length);
  note.writeUInt32LE(4, 0);
  note.writeUInt32LE(desc.length, 4);
  note.writeUInt32LE(5, 8);
  note.write("GNU\0", 12, "latin1");
  desc.copy(note, 16);

  const noteOffset = 64 + 2 * 56;
  const programHeaders = Buffer.alloc(2 * 56);
  programHeaders.writeUInt32LE(PT_LOAD, 0);
  programHeaders.writeUInt32LE(PT_NOTE, 56);
  programHeaders.writeBigUInt64LE(BigInt(noteOffset), 56 + 8);
  programHeaders.writeBigUInt64LE(BigInt(note.length), 56 + 32);
  programHeaders.writeBigUInt64LE(8n, 56 + 48);
  return Buffer.concat([header, programHeaders, note]);
}

const temporaryDirectories = [];

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "isa-baseline-"));
  temporaryDirectories.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(join(dir, relative, ".."), { recursive: true });
    writeFileSync(join(dir, relative), contents);
  }
  return dir;
}

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("isaLevelNeeded", () => {
  it("reads the highest level the X86_ISA_1_NEEDED property names", () => {
    // The v0.8.18 account helper: baseline, v2 and v3.
    expect(isaLevelNeeded(elf({ isaBits: 0b111 }))).toBe(3);
    expect(isaLevelNeeded(elf({ isaBits: 0b11 }))).toBe(2);
    expect(isaLevelNeeded(elf({ isaBits: 0b1 }))).toBe(1);
    expect(isaLevelNeeded(elf({ isaBits: 0b1111 }))).toBe(4);
  });

  it("returns 0 for a file without the property", () => {
    expect(isaLevelNeeded(elf())).toBe(0);
  });

  it("recognizes only x86-64 ELF64 files", () => {
    expect(isElfX64(elf())).toBe(true);
    expect(isElfX64(elf({ machine: 183 }))).toBe(false);
    expect(isElfX64(Buffer.from("#!/bin/sh\necho not elf\n".padEnd(64)))).toBe(false);
  });
});

describe("instructionsAboveV2", () => {
  it("flags AVX, AVX2, FMA, AVX-512 and BMI instructions", () => {
    const disassembly = [
      "0000000000001000 <f>:",
      "    1615f:\tvmovdqu 0x0(%r13),%ymm0",
      "    1616a:\tvfmadd231sd %xmm2,%xmm1,%xmm0",
      "    16170:\tvpaddd %zmm1,%zmm2,%zmm3{%k1}",
      "    16178:\tshlx   %eax,%edx,%ecx",
      "    1617e:\tandn   %eax,%edx,%ecx",
      "    16184:\tmovbe  (%rdi),%eax",
    ].join("\n");
    expect(instructionsAboveV2(disassembly)).toHaveLength(6);
  });

  it("passes baseline and v2 code", () => {
    const disassembly = [
      "0000000000001000 <f>:",
      "    1000:\tmovdqu (%rdi),%xmm0",
      "    1004:\tpshufb %xmm1,%xmm0",
      "    1009:\tpopcnt %rax,%rax",
      "    100e:\ttzcnt  %rax,%rax",
      "    1013:\trep stos %rax,%es:(%rdi)",
      "    1016:\tverw   %ax",
      "    1019:\tcall   1000 <f>",
    ].join("\n");
    expect(instructionsAboveV2(disassembly)).toEqual([]);
  });
});

describe("checkTree", () => {
  const baselineDisassembly = "    1000:\tmovdqu (%rdi),%xmm0\n";

  it("reports an ELF note above v2 and v3 instructions in a node-gyp addon", () => {
    const dir = tree({
      "account-helper/nodetool-account-helper": elf({ isaBits: 0b111 }),
      "backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node": elf(),
      "backend/node_modules/better-sqlite3/build/Release/obj.target/better_sqlite3.node": elf(),
      "backend/runtime/node": elf(),
    });
    const disassembled = [];
    const result = checkTree(dir, {
      disassemble: (file) => {
        disassembled.push(file);
        return "    1615f:\tvmovdqu 0x0(%r13),%ymm0\n";
      },
    });
    expect(result.elfFiles).toBe(4);
    expect(result.addons).toBe(1);
    expect(disassembled).toEqual([
      join(dir, "backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node"),
    ]);
    expect(result.problems).toEqual([
      "account-helper/nodetool-account-helper: its ELF note needs x86-64-v3, above x86-64-v2",
      "backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node: 1 instructions above x86-64-v2, first: 1615f:\tvmovdqu 0x0(%r13),%ymm0",
    ]);
  });

  it("passes a baseline tree and skips files that are not x86-64 ELF", () => {
    const dir = tree({
      "account-helper/nodetool-account-helper": elf({ isaBits: 0b1 }),
      "backend/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so": elf({ isaBits: 0b11 }),
      "backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node": elf(),
      "backend/node_modules/bufferutil/prebuilds/linux-arm64/bufferutil.node": elf({ machine: 183, isaBits: 0b111 }),
      "backend/server.mjs": "console.log('server');\n",
    });
    const result = checkTree(dir, { disassemble: () => baselineDisassembly });
    expect(result).toEqual({ elfFiles: 3, addons: 1, problems: [] });
  });
});
