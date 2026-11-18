# Timeline player

The timeline preview, shared by the [timeline app](../timeline/README.md) and
the native node editor. The
[plan](../../docs/plans/timeline-player/plan.md) moves it here in steps.

## Libraries

| Target | Dependencies | Contents |
|---|---|---|
| `nodetool_timeline_scene` | Qt Core, Yoga | The document types (`model/TimelineTypes.h`), `TimelineJson`, `TimelineSource`, `scene/`, the motion headers, `SceneEval`, `SceneHooks`, `TransitionResolver`, `CpuUsage` and `AudioClockFeed` |
| `yogacore` | none | [Yoga 3.2.1](third_party/yoga/README.md), the flex layout engine, unchanged |

`src/` keeps the folder layout of `native/timeline/src`. Both projects put
their `src/` on the include path, so `#include "scene/ClipScene.h"` works from
either one.

The scene sources compile without fused multiply-add (`-ffp-contract=off`), so
they round as the web's JavaScript does.

## Build

The timeline build adds this directory with `add_subdirectory` and links
`nodetool_timeline_scene` into `timeline_core`. Build and test it from there:

```bash
cmake --build native/timeline/build --target nodetool_timeline_scene tst_cpuusage
ctest --test-dir native/timeline/build -R '^tst_cpuusage$'
```

Tests that read the timeline's fixtures, such as `tst_sceneeval` and
`tst_timelinejson`, stay in `native/timeline` and link this library.

## Dependency check

`python3 native/ui_primitives/tools/check_dependencies.py` audits this
directory with the `timeline-player` policy. Nothing here may refer to the
timeline app, the node editor, the web or npm.
