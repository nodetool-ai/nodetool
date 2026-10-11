import { runExclusive } from "../exclusive";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("runExclusive", () => {
  it("starts a task on the same key only after the earlier one settles", async () => {
    const events: string[] = [];
    const first = deferred();
    const a = runExclusive("/root", async () => {
      events.push("a:start");
      await first.promise;
      events.push("a:end");
    });
    const b = runExclusive("/root", async () => {
      events.push("b:start");
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(["a:start"]);

    first.resolve();
    await Promise.all([a, b]);
    expect(events).toEqual(["a:start", "a:end", "b:start"]);
  });

  it("runs tasks on different keys in parallel", async () => {
    const events: string[] = [];
    const first = deferred();
    const a = runExclusive("/one", async () => {
      events.push("a:start");
      await first.promise;
    });
    const b = runExclusive("/two", async () => {
      events.push("b:start");
    });

    await b;
    expect(events).toEqual(["a:start", "b:start"]);
    first.resolve();
    await a;
  });

  it("releases the key when a task fails", async () => {
    await expect(
      runExclusive("/root", () => Promise.reject(new Error("boom")))
    ).rejects.toThrow("boom");
    await expect(runExclusive("/root", async () => "next")).resolves.toBe("next");
  });
});
