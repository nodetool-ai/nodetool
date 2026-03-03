# Memory Management UI

This document describes the Memory Management UI feature added to NodeTool.

## Overview

The Memory Management UI provides a visual interface for monitoring and managing system memory, GPU memory, and loaded AI models. It is accessible from the app header (top right) in development mode.

## Location

The Memory button (🧠 Memory icon) is located in the app header's right side buttons area, next to the notifications and help buttons. It is only visible in development mode (not in production).

## Components

### 1. MemoryButton (`web/src/components/buttons/MemoryButton.tsx`)

A simple button component that:
- Renders a memory icon in the app header
- Opens the Memory Management Dialog when clicked
- Uses Material-UI Tooltip for accessibility

### 2. MemoryManagementDialog (`web/src/components/dialogs/MemoryManagementDialog.tsx`)

A comprehensive dialog that displays and manages memory:

#### System Memory Section
- **RAM Usage**: Shows used/total RAM with percentage and progress bar
- **GPU Memory Allocated**: Displays allocated GPU memory with progress bar
- **GPU Memory Reserved**: Shows reserved GPU memory
- **Cache Items**: Number of cached items

#### Loaded Models Section
- Table showing all currently loaded AI models with:
  - Model ID
  - Model Name
  - Model Type
  - Memory Usage (in GB)
  - Status (In Use / Idle)
  - Unload action button
- Empty state when no models are loaded

#### Action Buttons
- **Refresh**: Manually refresh stats and models list
- **Clear GPU Cache**: Clears CUDA cache only
- **Unload All Models**: Unloads all models (with confirmation)
- **Full Cleanup**: Complete cleanup including models, URI cache, GPU, and garbage collection (with confirmation)

### 3. Memory Types (`web/src/types/memory.ts`)

TypeScript interfaces for the Memory API:
- `MemoryStats`: Current system memory statistics
- `LoadedModel`: Information about a loaded model
- `UnloadModelResponse`: Response from unloading a model
- `ClearModelsResponse`: Response from clearing all models
- `ClearGPUResponse`: Response from clearing GPU cache
- `FullCleanupResponse`: Response from full cleanup

## API Endpoints

The UI calls the following backend endpoints:

### GET /api/memory
Returns current memory statistics:
```typescript
{
  ram_total_gb: number;
  ram_used_gb: number;
  ram_percent: number;
  gpu_allocated_gb: number;
  gpu_reserved_gb: number;
  gpu_total_gb?: number;
  cache_count: number;
}
```

### GET /api/memory/models
Returns list of loaded models:
```typescript
[
  {
    id: string;
    name: string;
    memory_gb: number;
    type?: string;
    in_use: boolean;
  }
]
```

### DELETE /api/memory/models/{id}
Unloads a specific model:
- Query parameter: `?force=true` to force unload models in use
- Returns 409 if model is in use without force flag
- Returns success message and freed memory

### POST /api/memory/models/clear
Unloads all models:
```typescript
{
  success: boolean;
  models_unloaded: number;
  freed_memory_gb: number;
}
```

### POST /api/memory/gpu
Clears CUDA cache only:
```typescript
{
  success: boolean;
  message: string;
  freed_memory_gb?: number;
}
```

### POST /api/memory/all
Full cleanup (models + URI cache + GPU + GC):
```typescript
{
  success: boolean;
  models_unloaded: number;
  uri_cache_cleared: number;
  freed_memory_gb: number;
}
```

## Features

### Auto-refresh
- Memory stats automatically refresh every 5 seconds when the dialog is open
- Models list does not auto-refresh but can be manually refreshed

### Confirmations
- Unloading a model that is in use prompts for force unload confirmation
- Clearing all models requires confirmation
- Full cleanup requires confirmation

### Notifications
- Success notifications for all operations
- Error notifications with detailed messages
- Shows freed memory amounts in notifications

### Error Handling
- Graceful error handling with user-friendly messages
- Separate error states for stats and models
- Network errors are caught and displayed

## Testing

Unit tests are provided in:
- `web/src/components/buttons/__tests__/MemoryButton.test.tsx`

Tests cover:
- Button rendering
- Dialog open/close functionality
- User interactions

## Usage

1. Start the development server with backend running
2. Click the Memory icon (🧠) in the top right of the app header
3. View current memory statistics
4. Manage loaded models by unloading individual models or all at once
5. Use action buttons to clear GPU cache or perform full cleanup
6. Click refresh to update data manually
7. Close the dialog using the X button or click outside

## Integration

The Memory button is integrated into:
- `web/src/components/panels/RightSideButtons.tsx`

It appears alongside other header buttons like SystemStats, Notifications, Help, and Settings.

## Development Notes

- The component uses TanStack Query (React Query) for data fetching and caching
- Material-UI components provide consistent styling
- The dialog uses the app's theme for colors and spacing
- Only visible in development/localhost mode (controlled by `!isProduction`)
- Uses fetch API directly instead of the OpenAPI client since endpoints aren't in the generated types yet

## Future Enhancements

Possible improvements:
- Add charts for memory usage over time
- Display memory usage trends
- Add filtering and sorting for models table
- Export memory statistics
- Add memory usage alerts/warnings
- Show model loading history
- Add ability to preload models
- Integrate with system monitoring tools
