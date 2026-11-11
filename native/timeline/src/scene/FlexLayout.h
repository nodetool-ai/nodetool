#pragma once
// Flex layout: a port of `resolveClipLayoutsWithDiagnostics` in
// packages/timeline/src/render/layout.ts on the same Yoga (third_party/yoga,
// the C++ source of the `yoga-layout` npm package the web uses).
//
// A `group` clip with `layout.display == "flex"` lays out its children
// (`parentId`) with Yoga; a child sizes itself with `flexItem`. The result
// moves each laid-out clip's `transform.position` by the difference between
// its current box and the box Yoga computed, and resizes rect, ellipse and
// text leaves. The flex root keeps its own transform.
#include "model/TimelineTypes.h"
#include "scene/TextBlock.h"

#include <string>
#include <unordered_map>
#include <vector>

namespace nt::scene {

struct LayoutBox {
    double x = 0, y = 0, width = 0, height = 0;
};

struct FlexResult {
    // Every laid-out clip but the roots: the transform to draw with.
    std::unordered_map<std::string, ClipTransform> transforms;
    // A rect, ellipse or text leaf flex resized, in canvas pixels.
    std::unordered_map<std::string, LayoutBox> sizes;
    // Every node's Yoga box, canvas-centre-relative, roots included.
    std::unordered_map<std::string, LayoutBox> resolvedBoxes;
    std::vector<std::string> cycles;
};

// `clips` in document order (after the repeater and echo expansion), as the
// scene model sees them. `textStyles`: a text clip's animated style at this
// frame, by clip id (`layoutClipsAt`); a clip absent from it uses its own.
// `measure` null: the fallback width rule.
FlexResult resolveClipLayouts(const std::vector<const Clip*>& clips, double canvasWidth, double canvasHeight,
                              const std::unordered_map<std::string, TextStyle>& textStyles = {},
                              const MeasureText& measure = {});

// Yoga nodes alive now, for the tests: 0 between calls.
int flexLiveNodeCount();

// True when any clip is a flex container: the frame needs a layout pass.
bool hasFlexLayout(const std::vector<const Clip*>& clips);

}  // namespace nt::scene
