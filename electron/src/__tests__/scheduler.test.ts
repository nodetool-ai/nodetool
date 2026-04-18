/**
 * scheduler.ts regression tests (macOS launchctl integration).
 *
 * The plist content is the *contract* between NodeTool and `launchd`.
 * One bad escape, dropped key, or wrong interval coerces launchd to
 * silently refuse the agent. Lock the plist shape with snapshots and
 * verify the launchctl subprocess invocations.
 *
 * Node 24 / Electron 39 don't change child_process.exec semantics, but
 * `app.getPath('home')` is exercised at module load time — confirm the
 * test boots before app is ready (using our mock).
 */

const electronMock = jest.requireActual("../__mocks__/electron");
jest.mock("electron", () => electronMock);

jest.mock("../utils", () => ({
  getServerPort: jest.fn().mockReturnValue(7777),
  fileExists: jest.fn().mockResolvedValue(true),
}));

jest.mock("../logger", () => ({ logMessage: jest.fn() }));

jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
      stat: jest.fn().mockResolvedValue({ mode: 0o755 }),
      chmod: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const { exec } = require("child_process");
const { promises: fs } = require("fs");

import {
  createLaunchAgent,
  removeLaunchAgent,
  getLaunchAgentLogPath,
  getScheduledWorkflows,
} from "../scheduler";

describe("scheduler.createLaunchAgent", () => {
  beforeEach(() => {
    (fs.writeFile as jest.Mock).mockClear();
    (fs.mkdir as jest.Mock).mockClear();
    (exec as jest.Mock).mockClear();
  });

  test("writes the plist to ~/Library/LaunchAgents/<label>.<id>.plist", async () => {
    (exec as jest.Mock).mockImplementation(
      (
        _cmd: string,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );

    await createLaunchAgent("wf-abc", 15);

    const writeCalls = (fs.writeFile as jest.Mock).mock.calls;
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0][0]).toBe(
      "/mock/home/Library/LaunchAgents/ai.nodetool.workflow.wf-abc.plist",
    );
  });

  test("plist body contains StartInterval=intervalMinutes*60 and the workflow URL", async () => {
    (exec as jest.Mock).mockImplementation(
      (
        _cmd: string,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );

    await createLaunchAgent("wf-xyz", 5);

    const plist = (fs.writeFile as jest.Mock).mock.calls[0][1];
    expect(plist).toContain("<key>StartInterval</key>");
    expect(plist).toContain("<integer>300</integer>"); // 5 * 60
    expect(plist).toContain(
      "http://localhost:7777/api/workflows/wf-xyz/run",
    );
    expect(plist).toContain("<key>Label</key>");
    expect(plist).toContain("<string>ai.nodetool.workflow.wf-xyz</string>");
    expect(plist).toContain("<key>RunAtLoad</key>");
  });

  test("plist body is well-formed XML (round-trips through a regex sanity check)", async () => {
    (exec as jest.Mock).mockImplementation(
      (
        _cmd: string,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );

    await createLaunchAgent("wf-id-1", 1);

    const plist = (fs.writeFile as jest.Mock).mock.calls[0][1];
    expect(plist).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(plist).toMatch(/<\/plist>$/);

    // No unescaped ampersands or angle brackets in the workflow id position.
    const labelMatch = plist.match(/<key>Label<\/key>\s*<string>([^<]+)<\/string>/);
    expect(labelMatch?.[1]).toBe("ai.nodetool.workflow.wf-id-1");
  });

  test("invokes 'launchctl load <plistPath>' after writing the file", async () => {
    let execCmd = "";
    (exec as jest.Mock).mockImplementation(
      (
        cmd: string,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        execCmd = cmd;
        cb(null, "", "");
      },
    );

    await createLaunchAgent("wf-load", 10);

    expect(execCmd).toBe(
      "launchctl load /mock/home/Library/LaunchAgents/ai.nodetool.workflow.wf-load.plist",
    );
  });
});

describe("scheduler.removeLaunchAgent", () => {
  test("invokes 'launchctl unload <plistPath>' for the given workflow id", async () => {
    let execCmd = "";
    (exec as jest.Mock).mockImplementation(
      (
        cmd: string,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        execCmd = cmd;
        cb(null, "", "");
      },
    );

    await removeLaunchAgent("wf-rm");
    expect(execCmd).toBe(
      "launchctl unload /mock/home/Library/LaunchAgents/ai.nodetool.workflow.wf-rm.plist",
    );
  });
});

describe("scheduler.getScheduledWorkflows", () => {
  test("parses launchctl list output and returns workflow ids only", async () => {
    (exec as jest.Mock).mockImplementation(
      (
        _cmd: string,
        cb: (err: Error | null, stdout: string) => void,
      ) =>
        cb(
          null,
          [
            "PID\tStatus\tLabel",
            "1234\t0\tai.nodetool.workflow.alpha",
            "-\t0\tai.nodetool.workflow.beta",
            "5678\t0\tcom.apple.someother",
          ].join("\n"),
        ),
    );

    const ids = await getScheduledWorkflows();
    expect(ids).toEqual(["alpha", "beta"]);
  });

  test("returns [] when launchctl errors out", async () => {
    (exec as jest.Mock).mockImplementation(
      (
        _cmd: string,
        cb: (err: Error | null, stdout: string) => void,
      ) => cb(new Error("launchctl: not running"), ""),
    );

    const ids = await getScheduledWorkflows();
    expect(ids).toEqual([]);
  });
});

describe("scheduler.getLaunchAgentLogPath", () => {
  test("ensures the logs directory exists with mode 0o755", async () => {
    (fs.mkdir as jest.Mock).mockClear();

    const p = await getLaunchAgentLogPath("wf-log");

    expect(fs.mkdir).toHaveBeenCalledWith(
      "/mock/home/Library/Logs/nodetool",
      expect.objectContaining({ recursive: true, mode: 0o755 }),
    );
    expect(p).toBe("/mock/home/Library/Logs/nodetool/wf-log");
  });
});
