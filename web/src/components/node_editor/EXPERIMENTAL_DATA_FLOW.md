# Experimental Data Flow Visualization

## Overview

This experimental feature enhances the visual feedback of data flowing through workflow edges using animated particles and enhanced edge effects.

## Status: EXPERIMENTAL

⚠️ **Performance Note**: This feature is still being evaluated for performance with large workflows (100+ nodes, 200+ edges).

## Features

### 1. Enhanced Edge Animation
- Active data edges show animated dashed lines
- Subtle pulse effect on edges with active data flow
- Color-coded particles based on data type

### 2. Visual Indicators
- **Blue particles**: Image data
- **Purple particles**: Audio data  
- **Green particles**: Text data
- **Default particles**: Uses primary theme color

### 3. Accessibility
- Respects `prefers-reduced-motion` for users who need reduced animations
- All animations are GPU-accelerated using CSS transforms

## Implementation

### Component: `DataFlowParticles`

Located at: `web/src/components/node_editor/DataFlowParticles.tsx`

```tsx
import { DataFlowParticles } from "./node_editor/DataFlowParticles";

<DataFlowParticles isActive={data?.status === "message_sent"} />
```

### Edge Status Detection

The component detects active data flow through the edge's `data.status` property:

```tsx
const isActive = data?.status === "message_sent";
```

This status is set by `ResultsStore.setEdge()` during workflow execution.

## CSS Classes

### `.message-sent`
Applied to edges when data is actively flowing.

### `.pulse-active`
Adds a pulsing glow effect to active edges.

### `.streaming-active`
Enhanced animation for continuous data streams (large datasets).

### `.gradient-mode`
Alternative gradient-based flow animation.

## Performance Considerations

### Optimizations Applied
1. **CSS-only animations**: Uses CSS keyframes instead of JavaScript
2. **GPU acceleration**: Uses `transform` and `will-change` properties
3. **Memoized components**: Edge components are memoized to prevent re-renders
4. **Reduced motion**: Automatically disables animations for users who prefer reduced motion

### Potential Bottlenecks
- Large workflows (100+ nodes) with many active edges
- Complex SVG path calculations for particle positioning
- Browser rendering limits for simultaneous animations

### Future Improvements
- [ ] Evaluate canvas-based rendering for workflows with 200+ edges
- [ ] Add user settings to control animation intensity
- [ ] Implement adaptive quality based on workflow size
- [ ] Benchmark with real-world workflow scenarios

## Testing

Run tests with:

```bash
npm test -- DataFlowParticles
```

## Related Files

- `web/src/components/node_editor/CustomEdge.tsx` - Enhanced edge component
- `web/src/stores/ResultsStore.ts` - Edge status management
- `web/src/styles/handle_edge_tooltip.css` - Animation styles
- `web/src/components/node_editor/__tests__/DataFlowParticles.test.tsx` - Component tests

## Evaluation Criteria

This feature was chosen because it:

- ✅ **Feasible**: Pure frontend, uses ReactFlow's existing edge system
- ✅ **Impactful**: Visual-first approach, helps users understand execution
- ✅ **Aligned**: Fits NodeTool's visual-first, privacy-first philosophy
- ⚠️ **Performance**: Needs evaluation at scale

## Next Steps

1. **User Testing**: Gather feedback on visual clarity and helpfulness
2. **Performance Benchmarking**: Test with workflows of various sizes
3. **Settings Integration**: Add user preference controls
4. **Documentation**: Update user-facing docs if feature becomes stable

---

*Created: 2026-02-19*  
*Status: Experimental - Subject to change based on testing and feedback*
