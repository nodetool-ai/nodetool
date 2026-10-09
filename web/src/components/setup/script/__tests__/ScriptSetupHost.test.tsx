/**
 * The host hands the finished script to another surface, and that surface
 * loads the script from the server. The host saves first, so the load cannot
 * read a copy without stage `done` and reopen the Voices step (F12).
 */
import { act, render } from "@testing-library/react";

let finishFlow: (() => void | Promise<void>) | undefined;
let resolveFlush: () => void = () => undefined;
const flushScriptSync = jest.fn(
  () =>
    new Promise<void>((resolve) => {
      resolveFlush = resolve;
    })
);

jest.mock("../../../../hooks/script/useScriptServerSync", () => ({
  useScriptServerSync: () => "ready",
  flushScriptSync: (...args: unknown[]) => flushScriptSync(...(args as []))
}));
jest.mock("../../../../hooks/script/useScriptAgentBridge", () => ({
  useScriptAgentBridge: jest.fn()
}));
jest.mock("../useScriptSetupFlow", () => ({
  useScriptSetupFlow: ({
    onFinish
  }: {
    onFinish?: () => void | Promise<void>;
  }) => {
    finishFlow = onFinish;
    return { stage: "voices", steps: [], labels: { title: "Script" } };
  }
}));
jest.mock("../../SetupFlow", () => ({ SetupFlow: () => null }));
jest.mock("../../useFinishIfLoadedDone", () => ({
  useFinishIfLoadedDone: jest.fn()
}));

import ScriptSetupHost from "../ScriptSetupHost";

describe("ScriptSetupHost finish", () => {
  it("opens the script only after the host's save has landed", async () => {
    const onFinish = jest.fn();
    render(<ScriptSetupHost scriptId="s-host" onFinish={onFinish} />);
    expect(finishFlow).toBeDefined();

    let finished: Promise<void> | void = undefined;
    act(() => {
      finished = finishFlow!();
    });
    expect(flushScriptSync).toHaveBeenCalledWith("s-host");
    await Promise.resolve();
    expect(onFinish).not.toHaveBeenCalled();

    await act(async () => {
      resolveFlush();
      await finished;
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
