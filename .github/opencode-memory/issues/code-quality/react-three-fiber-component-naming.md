# React Three Fiber Component Naming Fix

**Problem**: React Three Fiber 3D components (`ambientLight`, `axesHelper`) were being used with lowercase naming, causing React warnings about incorrect casing and potential rendering issues.

**Solution**: Wrapped THREE.js objects (`AmbientLight`, `AxesHelper`) using the `primitive` component with explicit `object` prop, following React Three Fiber best practices for raw THREE.js objects.

**Files**:
- `web/src/components/asset_viewer/Model3DViewer.tsx` - Fixed 3D component usage
- `web/src/components/asset_viewer/__tests__/Model3DViewer.test.tsx` - Updated mock to include `AmbientLight` and `AxesHelper` constructors

**Changes**:
- Line 657: Changed `<ambientLight />` to `<primitive object={new THREE.AmbientLight(0xffffff, 0.3)} />`
- Lines 349-354: Changed `<axesHelper />` to `<primitive object={new THREE.AxesHelper(2)} />` with proper ref handling
- Test mock: Added `AmbientLight` and `AxesHelper` mock classes to support the new implementation

**Date**: 2026-01-20
