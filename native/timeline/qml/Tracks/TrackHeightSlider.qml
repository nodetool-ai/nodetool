// Mirrors `TrackHeightSlider` in TimelineZoomControls.tsx: the track height
// (vertical zoom, 0.75 to 2) in the tracks section header.
import QtQuick
import NodeTool.Timeline

CompactSlider {
    id: slider
    required property TimelineViewState viewState
    objectName: "trackHeightSlider"
    from: 0.75
    to: 2
    stepSize: 0.05
    value: viewState.verticalZoom
    onMoved: viewState.verticalZoom = value
}
