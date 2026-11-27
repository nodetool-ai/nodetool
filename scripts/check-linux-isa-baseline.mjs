#!/usr/bin/env node
/**
 * Fails when the packed Linux x64 app holds native code that an x86-64-v2 CPU
 * cannot run.
 *
 * v0.8.18 shipped x86-64-v3 code (AVX2, BMI2, FMA) built by the compiler on
 * the ubuntu-latest runner (GCC 15.2.0-16ubuntu1), although nothing in the
 * build asked for it. On an Intel Sandy Bridge CPU the account helper failed
 * with "CPU ISA level is lower than required" and the backend died with
 * SIGILL inside better-sqlite3 (issue #7950). The release now pins the
 * baseline with CFLAGS and CXXFLAGS. This check stops the next build that
 * slips past the pin.
 *
 * x86-64-v2 is the floor because sharp's prebuilt libvips already needs it.
 * Two checks run over every x86-64 ELF file under the given directory:
 *
 *   - The GNU property note. glibc refuses to load a file whose
 *     X86_ISA_1_NEEDED note names a level the CPU lacks. A note above v2
 *     fails.
 *   - The instructions of each addon node-gyp compiled during the build
 *     (`build/Release/*.node`). These carry no note, so objdump disassembles
 *     them and any AVX, AVX-512 or BMI instruction fails. Prebuilt packages
 *     that choose instructions at run time are left out.
 *
 * Usage: node scripts/check-linux-isa-baseline.mjs <dir>
 *        For example electron/dist/linux-unpacked/resources.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ELF_MAGIC = 0x464c457f;
const ELFCLASS64 = 2;
const EM_X86_64 = 62;
const PT_NOTE = 4;
const NT_GNU_PROPERTY_TYPE_0 = 5;
const GNU_PROPERTY_X86_ISA_1_NEEDED = 0xc0008002;
export const MAX_ISA_LEVEL = 2;

// BMI1, BMI2 and MOVBE, all in x86-64-v3. LZCNT and TZCNT are left out:
// objdump prints GCC's baseline `rep bsf` as tzcnt.
const V3_SCALAR_MNEMONICS = new Set([
  "andn", "bextr", "blsi", "blsmsk", "blsr", "bzhi", "mulx", "pdep", "pext",
  "rorx", "sarx", "shlx", "shrx", "movbe",
]);
// VEX- and EVEX-encoded instructions name a `v` mnemonic and a vector or mask
// register. The register test keeps out VERR, VERW and the VMX instructions.
const VECTOR_OPERAND = /%(?:[xyz]mm\d+|k[0-7])\b/;
const NODE_GYP_ADDON = /(?:^|\/)build\/Release\/[^/]+\.node$/;

/** True when the buffer starts with a little-endian x86-64 ELF64 header. */
export function isElfX64(buffer) {
  return (
    buffer.length >= 64 &&
    buffer.readUInt32LE(0) === ELF_MAGIC &&
    buffer[4] === ELFCLASS64 &&
    buffer[5] === 1 &&
    buffer.readUInt16LE(18) === EM_X86_64
  );
}

/**
 * Highest x86-64 level (1 baseline, 2 v2, 3 v3, 4 v4) the file's
 * X86_ISA_1_NEEDED property names, or 0 when it has no such property. Reads
 * the PT_NOTE segments, which stripping keeps.
 */
export function isaLevelNeeded(buffer) {
  if (!isElfX64(buffer)) {
    throw new Error("not an x86-64 ELF64 file");
  }
  const phoff = Number(buffer.readBigUInt64LE(0x20));
  const phentsize = buffer.readUInt16LE(0x36);
  const phnum = buffer.readUInt16LE(0x38);
  let bits = 0;
  for (let i = 0; i < phnum; i++) {
    const ph = phoff + i * phentsize;
    if (ph + 56 > buffer.length || buffer.readUInt32LE(ph) !== PT_NOTE) {
      continue;
    }
    const offset = Number(buffer.readBigUInt64LE(ph + 8));
    const size = Number(buffer.readBigUInt64LE(ph + 32));
    const align = Number(buffer.readBigUInt64LE(ph + 48)) >= 8 ? 8 : 4;
    bits |= isaBitsInNotes(buffer.subarray(offset, offset + size), align);
  }
  let level = 0;
  for (let bit = 0; bit < 4; bit++) {
    if (bits & (1 << bit)) {
      level = bit + 1;
    }
  }
  return level;
}

function pad(value, align) {
  return Math.ceil(value / align) * align;
}

// Offsets follow glibc's ELF_NOTE_DESC_OFFSET and ELF_NOTE_NEXT_OFFSET: the
// header and name together, then the description, pad to the alignment.
function isaBitsInNotes(notes, align) {
  let bits = 0;
  let at = 0;
  while (at + 12 <= notes.length) {
    const namesz = notes.readUInt32LE(at);
    const descsz = notes.readUInt32LE(at + 4);
    const type = notes.readUInt32LE(at + 8);
    const descOffset = pad(12 + namesz, align);
    const name = notes.toString("latin1", at + 12, at + 12 + namesz);
    if (type === NT_GNU_PROPERTY_TYPE_0 && name === "GNU\0") {
      bits |= isaBitsInProperties(notes.subarray(at + descOffset, at + descOffset + descsz));
    }
    at += pad(descOffset + descsz, align);
  }
  return bits;
}

function isaBitsInProperties(desc) {
  let bits = 0;
  let at = 0;
  while (at + 8 <= desc.length) {
    const type = desc.readUInt32LE(at);
    const size = desc.readUInt32LE(at + 4);
    if (type === GNU_PROPERTY_X86_ISA_1_NEEDED && size >= 4) {
      bits |= desc.readUInt32LE(at + 8);
    }
    at += 8 + pad(size, 8);
  }
  return bits;
}

/**
 * Lines of `objdump -d --no-show-raw-insn` output whose instruction needs
 * more than x86-64-v2.
 */
export function instructionsAboveV2(disassembly) {
  const found = [];
  for (const line of disassembly.split("\n")) {
    const match = /^\s*[0-9a-f]+:\s+(?:(?:lock|rep\w*|notrack|bnd|data16|addr32)\s+)*([a-z][a-z0-9.]*)\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const [, mnemonic, operands] = match;
    if (V3_SCALAR_MNEMONICS.has(mnemonic) || (mnemonic.startsWith("v") && VECTOR_OPERAND.test(operands))) {
      found.push(line.trim());
    }
  }
  return found;
}

function objdumpDisassemble(file) {
  const result = spawnSync("objdump", ["-d", "--no-show-raw-insn", file], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`objdump failed for ${file}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`objdump exited with ${result.status} for ${file}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function readHeader(file) {
  const header = Buffer.alloc(64);
  const fd = fs.openSync(file, "r");
  try {
    return header.subarray(0, fs.readSync(fd, header, 0, 64, 0));
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Checks every x86-64 ELF file under `dir`. Returns the counts and a list of
 * problems, one string per failing file.
 */
export function checkTree(dir, { disassemble = objdumpDisassemble } = {}) {
  const problems = [];
  let elfFiles = 0;
  let addons = 0;
  for (const file of walkFiles(dir)) {
    if (!isElfX64(readHeader(file))) {
      continue;
    }
    elfFiles++;
    const relative = path.relative(dir, file).split(path.sep).join("/");
    const level = isaLevelNeeded(fs.readFileSync(file));
    if (level > MAX_ISA_LEVEL) {
      problems.push(`${relative}: its ELF note needs x86-64-v${level}, above x86-64-v${MAX_ISA_LEVEL}`);
    }
    if (NODE_GYP_ADDON.test(relative) && !relative.includes("/obj.target/")) {
      addons++;
      const found = instructionsAboveV2(disassemble(file));
      if (found.length > 0) {
        problems.push(
          `${relative}: ${found.length} instructions above x86-64-v${MAX_ISA_LEVEL}, first: ${found[0]}`
        );
      }
    }
  }
  return { elfFiles, addons, problems };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error("Usage: node scripts/check-linux-isa-baseline.mjs <dir>");
    process.exit(2);
  }
  const { elfFiles, addons, problems } = checkTree(path.resolve(dir));
  if (elfFiles === 0 || addons === 0) {
    console.error(
      `Inspected ${elfFiles} x86-64 ELF files and ${addons} node-gyp addons under ${dir}. ` +
        "Expected at least one of each. Is this a packed Linux x64 tree?"
    );
    process.exit(1);
  }
  if (problems.length > 0) {
    console.error(`Native code above x86-64-v${MAX_ISA_LEVEL} under ${dir}:`);
    for (const problem of problems) {
      console.error(`  ${problem}`);
    }
    console.error("Build Linux native code with CFLAGS and CXXFLAGS set to -march=x86-64 -mtune=generic.");
    process.exit(1);
  }
  console.log(
    `OK: ${elfFiles} x86-64 ELF files and ${addons} node-gyp addons under ${dir} run on x86-64-v${MAX_ISA_LEVEL}.`
  );
}
