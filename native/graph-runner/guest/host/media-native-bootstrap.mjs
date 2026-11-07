// Native dependencies such as Yoga bind console methods during module loading.
// Use the same host log capability as entry.mjs before those dependencies run.
if (globalThis.console === undefined) {
  const write =
    (level) =>
    (...args) =>
      globalThis.__host.log(
        level,
        args
          .map((value) =>
            typeof value === "string" ? value : JSON.stringify(value)
          )
          .join(" ")
      );
  globalThis.console = {
    log: write("info"),
    info: write("info"),
    debug: () => {},
    warn: write("warn"),
    error: write("error")
  };
}
