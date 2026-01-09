let mousePosition = { x: 0, y: 0 };
// Initialize previousPositionForDelta with the initial mousePosition.
// The first delta will be {dx: 0, dy: 0} if getMouseDelta is called before any mouse move.
let previousPositionForDelta = { ...mousePosition };

// Wiggle detection state
interface WigglePoint {
  x: number;
  y: number;
  timestamp: number;
}

let wiggleHistory: WigglePoint[] = [];
let isCurrentlyWiggling = false;
const WIGGLE_TIME_WINDOW = 2000;
const WIGGLE_DISTANCE_THRESHOLD = 2; // minimum distance for a movement to count
const WIGGLE_DIRECTION_CHANGES_REQUIRED = 2; // number of direction changes needed
const WIGGLE_MIN_MOVEMENTS = 2; // minimum movements in time window

const updateMousePosition = (event: MouseEvent) => {
  mousePosition = { x: event.clientX, y: event.clientY };
};

// Ensure this runs only in the browser
if (typeof document !== "undefined") {
  document.addEventListener("mousemove", updateMousePosition);
}

export const getMousePosition = () => mousePosition;

export const getMouseDelta = () => {
  const dx = mousePosition.x - previousPositionForDelta.x;
  const dy = mousePosition.y - previousPositionForDelta.y;
  // Update previousPositionForDelta to the current mouse position for the next call
  previousPositionForDelta = { ...mousePosition };
  return { dx, dy };
};

// Add a movement to wiggle detection (call this from drag events)
export const addWiggleMovement = (x: number, y: number) => {
  const now = Date.now();
  const newPoint: WigglePoint = { x, y, timestamp: now };

  // Prevent duplicate entries with same coordinates and very close timestamps
  // This handles the case where both onNodeDrag and onSelectionDrag fire simultaneously
  const lastPoint = wiggleHistory[wiggleHistory.length - 1];
  if (
    lastPoint &&
    lastPoint.x === x &&
    lastPoint.y === y &&
    now - lastPoint.timestamp < 10
  ) {
    // Within 10ms
    return; // Skip this duplicate point
  }

  // Add new point
  wiggleHistory.push(newPoint);

  // Remove points older than time window
  wiggleHistory = wiggleHistory.filter(
    (point) => now - point.timestamp <= WIGGLE_TIME_WINDOW
  );

  // Check if we have enough movements
  if (wiggleHistory.length < WIGGLE_MIN_MOVEMENTS) {
    isCurrentlyWiggling = false;
    return;
  }

  // Calculate direction changes
  let directionChanges = 0;

  for (let i = 2; i < wiggleHistory.length; i++) {
    const prev = wiggleHistory[i - 2];
    const curr = wiggleHistory[i - 1];
    const next = wiggleHistory[i];

    // Calculate movement vectors
    const vec1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const vec2 = { x: next.x - curr.x, y: next.y - curr.y };

    // Calculate distances
    const dist1 = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
    const dist2 = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);

    // Only count significant movements
    if (
      dist1 > WIGGLE_DISTANCE_THRESHOLD &&
      dist2 > WIGGLE_DISTANCE_THRESHOLD
    ) {
      // Calculate dot product to detect direction change
      const dotProduct = vec1.x * vec2.x + vec1.y * vec2.y;
      const magnitude1 = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
      const magnitude2 = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);

      if (magnitude1 > 0 && magnitude2 > 0) {
        const cosAngle = dotProduct / (magnitude1 * magnitude2);
        // If angle is > 90 degrees (cosAngle < 0), it's a direction change
        if (cosAngle < -0.3) {
          // Allow some tolerance
          directionChanges++;
        }
      }
    }
  }

  // Determine if wiggling
  isCurrentlyWiggling = directionChanges >= WIGGLE_DIRECTION_CHANGES_REQUIRED;
};

// Check if currently wiggling
export const isWiggling = () => isCurrentlyWiggling;

// Reset wiggle detection (call when drag starts)
export const resetWiggleDetection = () => {
  wiggleHistory = [];
  isCurrentlyWiggling = false;
};

export const cleanupMousePositionListener = () => {
  // Ensure this runs only in the browser
  if (typeof document !== "undefined") {
    document.removeEventListener("mousemove", updateMousePosition);
  }
};
