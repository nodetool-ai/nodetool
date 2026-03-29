# ImageListProperty Component

## Overview
The `ImageListProperty` component allows users to manage a list of images through a visual grid interface with drag-and-drop support.

## Features
- **Grid Layout**: Images are displayed in a responsive grid with 1:1 aspect ratio
- **Drag and Drop**: Support for dropping multiple image files at once
- **Remove Images**: Each image has a remove button (visible on hover)
- **Image Dimensions**: Display image dimensions on hover
- **Visual Feedback**: Drag-over state with visual indication

## Usage

### Backend Integration
To use this property in a node, define the property type as `image_list` in your backend node metadata:

```python
from pydantic import BaseModel, Field

class MyNode(BaseModel):
    images: list[ImageRef] = Field(
        default=[],
        description="List of images",
        json_schema_extra={"type": "image_list"}
    )
```

Or for a list type:

```python
images: list[ImageRef] = Field(
    default=[],
    description="List of images"
)
```

The component will automatically be selected for:
- Properties with `json_schema_extra.type = "image_list"`
- Properties with type `list[ImageRef]` (list of images)

### Data Format
The component stores an array of image items:

```typescript
interface ImageItem {
  uri: string;      // URL to the image
  type: string;     // "image"
}

// Example value:
[
  { uri: "https://example.com/image1.jpg", type: "image" },
  { uri: "https://example.com/image2.jpg", type: "image" }
]
```

## Component Behavior

### Empty State
When no images are present, the component displays a dropzone with the text "Drop images here".

### Adding Images
- Users can drag and drop one or multiple image files onto the dropzone
- Files are automatically uploaded as assets
- Successfully uploaded images are added to the grid

### Removing Images
- Hover over an image to reveal the remove button (×) in the top-right corner
- Click the remove button to delete the image from the list

### Visual Features
- **Grid Layout**: Responsive grid with minimum 80px columns
- **Aspect Ratio**: All images maintain 1:1 aspect ratio with object-fit: cover
- **Hover Effects**: Border color changes and remove button appears on hover
- **Image Dimensions**: Original dimensions shown on hover (via ImageDimensions component)
- **Drag Feedback**: Dropzone changes appearance when files are dragged over it

## File Structure
```
web/src/components/properties/
├── ImageListProperty.tsx           # Main component
└── __tests__/
    └── ImageListProperty.test.tsx  # Component tests
```

## Tests
The component includes comprehensive unit tests covering:
- Rendering with empty value
- Rendering with existing images
- Removing images
- Drag and drop interactions
- Edge cases (null values, etc.)

Run tests with:
```bash
npm test -- ImageListProperty.test.tsx
```

## Example Screenshots

### Empty State
```
┌─────────────────────────────────────┐
│ Images                              │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │      Drop images here           │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### With Images
```
┌─────────────────────────────────────┐
│ Images                              │
├─────────────────────────────────────┤
│ ┌───┐ ┌───┐ ┌───┐                  │
│ │ 1 │ │ 2 │ │ 3 │                  │
│ └───┘ └───┘ └───┘                  │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │      Drop images here           │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Hover State
```
┌───┐
│ × │  ← Remove button
│   │
│ 🖼️ │  ← Image
│   │
│128│  ← Dimensions
│×96│     (on hover)
└───┘
```

## Technical Details

### Dependencies
- `@emotion/react` - Styling
- `@mui/material` - UI components (IconButton, Tooltip)
- `react` - Core framework
- Custom hooks:
  - `useAssetUpload` - File upload handling
- Custom components:
  - `PropertyLabel` - Label component
  - `ImageDimensions` - Dimension display

### Performance
- Uses `memo` with `isEqual` for optimized re-rendering
- `useMemo` for image array to prevent unnecessary updates
- `useCallback` for event handlers
- Refs for image elements to avoid re-renders when measuring dimensions

### Styling
The component uses CSS-in-JS with emotion and respects the Material-UI theme:
- Colors from theme palette (grey, error)
- Consistent spacing and borders
- Smooth transitions (0.2s ease)
- Responsive grid layout
