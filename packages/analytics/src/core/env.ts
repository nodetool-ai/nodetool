type Env = Readonly<Record<string, string | undefined>>;

const OFF = new Set(["0", "false", "off", "no", "disable", "disabled"]);
const ON = new Set(["1", "true", "yes"]);

/**
 * True when the environment turns analytics off: `NODETOOL_TELEMETRY` set to
 * an off value, or the cross-tool `DO_NOT_TRACK=1`. A disabling variable
 * always wins over stored consent. No variable turns analytics on: consent
 * only comes from an explicit command or setting.
 */
export function isAnalyticsDisabledByEnv(env: Env): boolean {
  const telemetry = env["NODETOOL_TELEMETRY"]?.trim().toLowerCase();
  if (telemetry !== undefined && OFF.has(telemetry)) return true;
  const doNotTrack = env["DO_NOT_TRACK"]?.trim().toLowerCase();
  return doNotTrack !== undefined && ON.has(doNotTrack);
}
