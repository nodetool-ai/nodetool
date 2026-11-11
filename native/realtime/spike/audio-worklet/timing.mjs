export function quantumTiming(events, name, expectedCount) {
  if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0) {
    throw new Error("A positive quantum count is required");
  }
  const durations = events.filter(event => event.name === name && event.ph === "X")
    .map(event => event.dur);
  if (durations.length !== expectedCount ||
      durations.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error(`Expected ${expectedCount} valid ${name} duration events, found ${durations.length}`);
  }
  const meanUs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const standardDeviationUs = Math.sqrt(durations.reduce((sum, value) => sum + (value - meanUs) ** 2, 0) / durations.length);
  durations.sort((left, right) => left - right);
  return {
    count: durations.length, meanUs, standardDeviationUs,
    p999Us: durations[Math.ceil(durations.length * 0.999) - 1],
    worstUs: durations.at(-1)
  };
}
