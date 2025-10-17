# Global Audio Queue System

## Overview

The global audio queue system prevents overlapping audio playback when multiple audio outputs are present in the workflow. Only one audio source plays at a time, with others automatically queued.

## Architecture

### AudioQueueStore (Zustand Store)

**Location:** `/stores/AudioQueueStore.ts`

Manages the global playback queue:

- **`currentPlayingId`**: ID of the currently playing audio
- **`queue`**: Array of pending audio playback requests
- **`enqueue(item)`**: Add audio to queue (plays immediately if nothing is playing)
- **`dequeue(id)`**: Remove from queue or stop if currently playing
- **`finishCurrent()`**: Complete current playback and start next in queue
- **`stopAll()`**: Stop all playback and clear queue
- **`isPlaying(id)`**: Check if a specific audio is currently playing
- **`isQueued(id)`**: Check if a specific audio is in the queue

### useRealtimeAudioPlayback Hook

**Location:** `/hooks/browser/useRealtimeAudioPlayback.ts`

Integrates Web Audio API with the global queue:

**Key Features:**

- Auto-registers with queue on mount
- Only schedules/plays audio when queue grants permission
- Cleans up and dequeues on unmount
- Generates unique ID per instance (or uses provided `nodeId`)

**State Management:**

- **`internalPlaying`**: Internal playback state (controlled by queue)
- **`wantsToPlay`**: User intent to play (controls queue registration)
- **`isQueuedPlaying`**: Whether this instance is currently authorized by queue
- **`isQueued`**: Whether this instance is waiting in queue

**Return Values:**

```typescript
{
  isPlaying: boolean;        // Is playing or queued
  isQueued: boolean;          // Waiting in queue
  queuePosition: number | null; // Position in queue (1-indexed)
  start: () => void;          // Request playback
  stop: () => void;           // Stop and dequeue
  restart: () => void;        // Restart from beginning
  stream: MediaStream | null; // For visualization
  visualizerVersion: number;  // For visualizer updates
}
```

### RealtimeAudioOutput Component

**Location:** `/components/node/output/RealtimeAudioOutput.tsx`

Presentation component that:

- Uses the `useRealtimeAudioPlayback` hook
- Displays play/stop/restart controls
- Shows queue position when waiting
- Integrates audio visualizer

## How It Works

### 1. Component Mount

```
Audio Component #1 mounts
  → Hook auto-enqueues with unique ID
  → No one is playing, starts immediately
  → Audio plays
```

### 2. Second Component Mounts

```
Audio Component #2 mounts
  → Hook auto-enqueues
  → Audio #1 is playing, added to queue
  → Shows "Queue position: 1"
  → Waits...
```

### 3. First Audio Completes

```
Audio #1 finishes all chunks
  → Hook should call finishCurrent() (TODO: auto-detection)
  → Queue starts Audio #2
  → Audio #2 begins playback
```

### 4. Manual Stop

```
User clicks Stop on Audio #1
  → Calls stop()
  → Dequeues from store
  → Queue starts Audio #2
```

### 5. Component Unmount

```
Audio Component unmounts
  → useEffect cleanup
  → Dequeues from store
  → If was playing, next in queue starts
```

## Usage

### Basic Usage (Auto ID)

```typescript
const MyAudioComponent = ({ chunks }) => {
  const { isPlaying, isQueued, queuePosition, start, stop } =
    useRealtimeAudioPlayback({
      chunks,
      sampleRate: 22000,
      channels: 1
    });

  return (
    <div>
      <button onClick={isPlaying ? stop : start}>
        {isPlaying ? "Stop" : "Start"}
      </button>
      {isQueued && <span>Queue: {queuePosition}</span>}
    </div>
  );
};
```

### With Custom Node ID

```typescript
const MyNodeAudio = ({ nodeId, chunks }) => {
  const { isPlaying, start, stop } = useRealtimeAudioPlayback({
    chunks,
    sampleRate: 22000,
    channels: 1,
    nodeId // Use stable node ID
  });

  // ... rest of component
};
```

## Future Improvements

### Auto-Completion Detection

Currently, the hook doesn't automatically call `finishCurrent()` when all chunks are done playing. This could be added by:

1. Tracking when last chunk's buffer source ends
2. Detecting when no more chunks will arrive
3. Automatically calling `audioQueue.finishCurrent()`

### Priority Queuing

Could add priority levels:

```typescript
enqueue(item: AudioQueueItem, priority?: 'high' | 'normal' | 'low')
```

### Concurrent Playback

Could allow N simultaneous audio streams (currently limited to 1):

```typescript
interface AudioQueueState {
  maxConcurrent: number; // Default: 1
  currentPlaying: string[]; // Array instead of single ID
}
```

### Global Controls

Add global UI for the queue:

- View all queued audio
- Reorder queue
- Skip to next
- Clear all

## Debug Logging

The system includes comprehensive debug logging:

```javascript
// Check queue state
useAudioQueue.getState()

// View console logs
[RealtimeAudio] Requesting playback via queue
[RealtimeAudio] Internal start
[RealtimeAudio] Scheduling chunks: lastIndex=0, total=5, new=5
[RealtimeAudio] Scheduling chunk 0
[RealtimeAudio] Scheduling chunk 1
...
```

## Benefits

1. **No Overlapping Audio**: Only one audio plays at a time
2. **Fair Queuing**: First-come, first-served
3. **Automatic Management**: Components handle queue lifecycle automatically
4. **Clean State**: Proper cleanup prevents memory leaks
5. **User Feedback**: Shows queue position to users
6. **Reusable**: Any component can integrate via the hook

## Testing

To test the queue system:

1. Create workflow with multiple audio-generating nodes
2. Run workflow to generate audio in all nodes
3. Observe that only one plays at a time
4. Check queue positions in the UI
5. Stop one and verify next starts automatically
