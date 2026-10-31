// Mirrors `TrackHeightSlider` in TimelineZoomControls.tsx: the track height
// (vertical zoom, 0.75 to 2) in the tracks section header.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Slider {
    id: slider
    property real gestureBaseline: 0
    required property TimelineViewState viewState
    objectName: "trackHeightSlider"
    from: 0.75
    to: 2
    stepSize: 0.05
    value: viewState.verticalZoom
    onEditStarted: gestureBaseline = value
    onValuePreviewed: value => viewState.verticalZoom = value
    onValueCommitted: value => viewState.verticalZoom = value
    onEditCanceled: viewState.verticalZoom = gestureBaseline
    accessibleName: "Track height"
    density: Ui.EditorButton.Compact
}
