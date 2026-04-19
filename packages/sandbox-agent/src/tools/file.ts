/**
 * File tools — direct fs operations inside the sandbox container.
 *
 * Paths are passed through as-is; the container's filesystem IS the sandbox
 * boundary, so there's no chroot logic here. The server runs as an
 * unprivileged user; `sudo` is allowed only when the caller requests it AND
 * passwordless sudo is configured in the image for whitelisted commands.
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  type FileReadInput,
  type FileReadOutput,
  type FileWriteInput,
  type FileWriteOutput,
  type FileStrReplaceInput,
  type FileStrReplaceOutput,
  type FileFindInContentInput,
  type FileFindInContentOutput,
  type FileFindByNameInput,
  type FileFindByNameOutput,
  type FileMatch
} from "@nodetool/sandbox/schemas";

const MAX_READ_BYTES = 10 * 1024 * 1024;

export async function fileRead(input: FileReadInput): Promise<FileReadOutput> {
  const raw = await readMaybeSudo(input.file, input.sudo ?? false);
  const text = raw.toString("utf-8");
  const lines = text.split("\n");
  const total = lines.length;

  const requestedStartLine = input.start_line ?? 1;
  const requestedEndLine = input.end_line ?? total;
  const startIdx = Math.max(0, requestedStartLine - 1);
  const endIdx = Math.min(total, requestedEndLine);
  const slice = lines.slice(startIdx, endIdx).join("\n");

  return {
    content: slice,
    total_lines: total,
    truncated: raw.byteLength >= MAX_READ_BYTES
  };
}

export async function fileWrite(
  input: FileWriteInput
): Promise<FileWriteOutput> {
  let content = input.content;
  if (input.leading_newline && !content.startsWith("\n")) content = "\n" + content;
  if (input.trailing_newline && !content.endsWith("\n")) content = content + "\n";

  await fs.mkdir(dirname(input.file), { recursive: true });

  if (input.sudo) {
    await writeSudo(input.file, content, input.append ?? false);
  } else if (input.append) {
    await fs.appendFile(input.file, content, "utf-8");
  } else {
    await fs.writeFile(input.file, content, "utf-8");
  }

  return {
    bytes_written: Buffer.byteLength(content, "utf-8"),
    file: input.file
  };
}

export async function fileStrReplace(
  input: FileStrReplaceInput
): Promise<FileStrReplaceOutput> {
  const raw = await readMaybeSudo(input.file, input.sudo ?? false);
  const text = raw.toString("utf-8");
  const parts = text.split(input.old_str);
  const replacements = parts.length - 1;
  if (replacements === 0) {
    throw new Error(`old_str not found in ${input.file}`);
  }
  const next = parts.join(input.new_str);
  if (input.sudo) {
    await writeSudo(input.file, next, false);
  } else {
    await fs.writeFile(input.file, next, "utf-8");
  }
  return { replacements, file: input.file };
}

export async function fileFindInContent(
  input: FileFindInContentInput
): Promise<FileFindInContentOutput> {
  const raw = await readMaybeSudo(input.file, input.sudo ?? false);
  const text = raw.toString("utf-8");
  const lines = text.split("\n");
  const re = new RegExp(input.regex);
  const matches: FileMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (m) {
      matches.push({
        line_number: i + 1,
        line: lines[i],
        match: m[0]
      });
    }
  }
  return { matches };
}

export async function fileFindByName(
  input: FileFindByNameInput
): Promise<FileFindByNameOutput> {
  // Use `find` with -name to keep globs simple and behavior predictable.
  // We pass the glob as-is; shell quoting is handled by spawn's argv form.
  const paths = await runFind(input.path, input.glob);
  return { paths };
}

// ---- internals -------------------------------------------------------------

async function readMaybeSudo(file: string, sudo: boolean): Promise<Buffer> {
  if (!sudo) {
    const stat = await fs.stat(file);
    if (stat.size > MAX_READ_BYTES) {
      const fd = await fs.open(file, "r");
      try {
        const buf = Buffer.alloc(MAX_READ_BYTES);
        await fd.read(buf, 0, MAX_READ_BYTES, 0);
        return buf;
      } finally {
        await fd.close();
      }
    }
    return fs.readFile(file);
  }
  return runCapture("sudo", ["-n", "cat", file]);
}

async function writeSudo(
  file: string,
  content: string,
  append: boolean
): Promise<void> {
  const cmd = append
    ? ["sudo", "-n", "tee", "-a", file]
    : ["sudo", "-n", "tee", file];
  await runWithStdin(cmd[0], cmd.slice(1), content);
}

function runCapture(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => err.push(c));
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve(Buffer.concat(out));
      else
        reject(
          new Error(
            Buffer.concat(err).toString("utf-8").trim() || `${cmd} exit ${code}`
          )
        );
    });
  });
}

function runWithStdin(
  cmd: string,
  args: string[],
  stdin: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(cmd, args, {
      stdio: ["pipe", "ignore", "pipe"]
    });
    const err: Buffer[] = [];
    child.stderr?.on("data", (c: Buffer) => err.push(c));
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            Buffer.concat(err).toString("utf-8").trim() || `${cmd} exit ${code}`
          )
        );
    });
    child.stdin?.end(stdin, "utf-8");
  });
}

function runFind(root: string, glob: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn("find", ["--", root, "-name", glob], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => err.push(c));
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code !== 0 && code !== 1) {
        reject(
          new Error(
            Buffer.concat(err).toString("utf-8").trim() || `find exit ${code}`
          )
        );
        return;
      }
      const text = Buffer.concat(out).toString("utf-8");
      const paths = text.split("\n").map((s) => s.trim()).filter(Boolean);
      resolve(paths);
    });
  });
}
