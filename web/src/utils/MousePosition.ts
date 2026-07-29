let mousePosition = { x: 0, y: 0 };

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

export const getMousePosition = (): { x: number; y: number } => mousePosition;

// Add a movement to wiggle detection (call this from drag events)
export const addWiggleMovement = (x: number, y: number): void => {
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
    return;
  }

  wiggleHistory.push(newPoint);

  wiggleHistory = wiggleHistory.filter(
    (point) => now - point.timestamp <= WIGGLE_TIME_WINDOW
  );

  if (wiggleHistory.length < WIGGLE_MIN_MOVEMENTS) {
    isCurrentlyWiggling = false;
    return;
  }

  let directionChanges = 0;

  for (let i = 2; i < wiggleHistory.length; i++) {
    const prev = wiggleHistory[i - 2];
    const curr = wiggleHistory[i - 1];
    const next = wiggleHistory[i];

    const vec1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const vec2 = { x: next.x - curr.x, y: next.y - curr.y };

    const dist1 = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
    const dist2 = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);

    if (
      dist1 > WIGGLE_DISTANCE_THRESHOLD &&
      dist2 > WIGGLE_DISTANCE_THRESHOLD
    ) {
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

  isCurrentlyWiggling = directionChanges >= WIGGLE_DIRECTION_CHANGES_REQUIRED;
};

export const isWiggling = (): boolean => isCurrentlyWiggling;

/** Call when a drag starts. */
export const resetWiggleDetection = (): void => {
  wiggleHistory = [];
  isCurrentlyWiggling = false;
};

