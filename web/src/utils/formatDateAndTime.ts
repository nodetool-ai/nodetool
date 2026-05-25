export function secondsToHMS(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds = Math.floor(seconds % 60);

  const paddedHours = String(hours).padStart(2, "0");
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
}

export function relativeTime(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  // [singular, plural, seconds]
  const timeUnits: [string, string, number][] = [
    ["year", "years", 31536000],
    ["month", "months", 2592000],
    ["week", "weeks", 604800],
    ["day", "days", 86400],
    ["hour", "hours", 3600],
    ["min", "min", 60],
    ["sec", "sec", 1]
  ];

  for (const [singular, plural, secondsInUnit] of timeUnits) {
    const difference = Math.floor(diffInSeconds / secondsInUnit);

    if (difference >= 1) {
      return difference === 1 ? `1 ${singular} ago` : `${difference} ${plural} ago`;
    }
  }

  return "just now";
}

