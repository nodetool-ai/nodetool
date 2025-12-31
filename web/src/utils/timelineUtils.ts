/**
 * Timeline utility functions for time conversion and formatting
 */

/**
 * Formats time in seconds to timecode format (HH:MM:SS:FF)
 * @param seconds - Time in seconds
 * @param frameRate - Frames per second (default: 30)
 * @returns Formatted timecode string
 */
export const formatTimecode = (seconds: number, frameRate: number = 30): string => {
  if (seconds < 0) {
    return "00:00:00:00";
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * frameRate);
  
  const pad = (n: number, digits: number = 2): string => 
    n.toString().padStart(digits, "0");
  
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}:${pad(frames)}`;
};

/**
 * Formats time in seconds to MM:SS.ms format
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export const formatTime = (seconds: number): string => {
  if (seconds < 0) {
    return "00:00.000";
  }
  
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  const pad = (n: number, digits: number = 2): string => 
    n.toString().padStart(digits, "0");
  
  return `${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
};

/**
 * Formats time in seconds to a short format (for compact displays)
 * @param seconds - Time in seconds
 * @returns Formatted time string (e.g., "1:30" or "2:15:30")
 */
export const formatTimeShort = (seconds: number): string => {
  if (seconds < 0) {
    return "0:00";
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Converts seconds to frames
 * @param seconds - Time in seconds
 * @param frameRate - Frames per second
 * @returns Frame number
 */
export const secondsToFrames = (seconds: number, frameRate: number): number => {
  return Math.round(seconds * frameRate);
};

/**
 * Converts frames to seconds
 * @param frames - Frame number
 * @param frameRate - Frames per second
 * @returns Time in seconds
 */
export const framesToSeconds = (frames: number, frameRate: number): number => {
  return frames / frameRate;
};

/**
 * Converts pixel position to time based on zoom level
 * @param pixels - Pixel position
 * @param pixelsPerSecond - Zoom level in pixels per second
 * @returns Time in seconds
 */
export const pixelsToTime = (pixels: number, pixelsPerSecond: number): number => {
  return pixels / pixelsPerSecond;
};

/**
 * Converts time to pixel position based on zoom level
 * @param time - Time in seconds
 * @param pixelsPerSecond - Zoom level in pixels per second
 * @returns Pixel position
 */
export const timeToPixels = (time: number, pixelsPerSecond: number): number => {
  return time * pixelsPerSecond;
};

/**
 * Snaps time to the nearest frame boundary
 * @param time - Time in seconds
 * @param frameRate - Frames per second
 * @returns Snapped time in seconds
 */
export const snapToFrame = (time: number, frameRate: number): number => {
  const frames = Math.round(time * frameRate);
  return frames / frameRate;
};

/**
 * Snaps time to the nearest grid interval
 * @param time - Time in seconds
 * @param gridInterval - Grid interval in seconds
 * @returns Snapped time in seconds
 */
export const snapToGrid = (time: number, gridInterval: number): number => {
  if (gridInterval <= 0) {
    return time;
  }
  return Math.round(time / gridInterval) * gridInterval;
};

/**
 * Clamps a value between min and max
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

/**
 * Calculates the visible time range based on scroll position and viewport width
 * @param scrollLeft - Scroll position in pixels
 * @param viewportWidth - Viewport width in pixels
 * @param pixelsPerSecond - Zoom level in pixels per second
 * @returns Object with start and end time in seconds
 */
export const getVisibleTimeRange = (
  scrollLeft: number,
  viewportWidth: number,
  pixelsPerSecond: number
): { start: number; end: number } => {
  const start = pixelsToTime(scrollLeft, pixelsPerSecond);
  const end = pixelsToTime(scrollLeft + viewportWidth, pixelsPerSecond);
  return { start, end };
};

/**
 * Generates tick marks for the time ruler
 * @param startTime - Start time in seconds
 * @param endTime - End time in seconds
 * @param pixelsPerSecond - Zoom level
 * @param minPixelsBetweenTicks - Minimum pixels between major ticks
 * @returns Array of tick objects with time and type
 */
export const generateRulerTicks = (
  startTime: number,
  endTime: number,
  pixelsPerSecond: number,
  minPixelsBetweenTicks: number = 80
): Array<{ time: number; type: "major" | "minor" | "micro" }> => {
  const ticks: Array<{ time: number; type: "major" | "minor" | "micro" }> = [];
  
  // Determine appropriate interval based on zoom level
  const secondsPerMajorTick = minPixelsBetweenTicks / pixelsPerSecond;
  
  // Find the nearest "nice" interval
  const niceIntervals = [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  let majorInterval = 1;
  for (const interval of niceIntervals) {
    if (interval >= secondsPerMajorTick) {
      majorInterval = interval;
      break;
    }
  }
  
  const minorInterval = majorInterval / 4;
  const microInterval = majorInterval / 10;
  
  // Round start time down to nearest major interval
  const adjustedStart = Math.floor(startTime / majorInterval) * majorInterval;
  
  // Generate ticks
  for (let time = adjustedStart; time <= endTime; time += microInterval) {
    if (time < startTime) {
      continue;
    }
    
    const isMajor = Math.abs(time % majorInterval) < 0.0001 || 
                    Math.abs((time % majorInterval) - majorInterval) < 0.0001;
    const isMinor = !isMajor && (
      Math.abs(time % minorInterval) < 0.0001 || 
      Math.abs((time % minorInterval) - minorInterval) < 0.0001
    );
    
    ticks.push({
      time: Math.round(time * 1000) / 1000, // Round to avoid floating point issues
      type: isMajor ? "major" : isMinor ? "minor" : "micro"
    });
  }
  
  return ticks;
};

/**
 * Checks if two time ranges overlap
 * @param start1 - Start time of first range
 * @param end1 - End time of first range
 * @param start2 - Start time of second range
 * @param end2 - End time of second range
 * @returns True if ranges overlap
 */
export const rangesOverlap = (
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean => {
  return start1 < end2 && end1 > start2;
};

/**
 * Generates a unique ID for timeline elements
 * @returns Unique ID string
 */
export const generateTimelineId = (): string => {
  return `tl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};
