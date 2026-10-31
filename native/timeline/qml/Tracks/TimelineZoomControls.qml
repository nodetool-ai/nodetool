// Mirrors web/src/components/timeline/Tracks/TimelineZoomControls.tsx: the
// horizontal zoom, inline in the timeline toolbar. Zoom out (x1.25), the
// log-scale slider, zoom in (x0.8), zoom to fit. A step or slider zoom keeps
// the playhead at its viewport x; it reads the clock once, on the click.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Row {
    id: controls
    objectName: "timelineZoomControls"
    required property TimelineViewState viewState
    required property PlaybackClock clock
    // Narrow toolbar: keep the step buttons, drop the slider.
    property bool compact: false
    spacing: Ui.Metrics.xs

    Ui.ToolbarIconButton {
        objectName: "zoomOut"
        anchors.verticalCenter: parent.verticalCenter
        iconName: "remove"
        accessibleName: "Zoom out"
        enabled: controls.viewState.canZoomOut
        onClicked: controls.viewState.zoomBy(1.25, controls.clock.time)
    }
    Ui.Slider {
        objectName: "zoomSlider"
        property real gestureBaseline: 0
        visible: !controls.compact
        anchors.verticalCenter: parent.verticalCenter
        width: Ui.Metrics.standard * 3
        from: 0
        to: 100
        stepSize: 1
        value: controls.viewState.zoomSliderValue
        onEditStarted: gestureBaseline = value
        onValuePreviewed: value => controls.viewState.zoomFromSlider(value, controls.clock.time)
        onValueCommitted: value => controls.viewState.zoomFromSlider(value, controls.clock.time)
        onEditCanceled: controls.viewState.zoomFromSlider(gestureBaseline, controls.clock.time)
        accessibleName: "Timeline zoom"
        density: Ui.EditorButton.Compact
    }
    Ui.ToolbarIconButton {
        objectName: "zoomIn"
        anchors.verticalCenter: parent.verticalCenter
        iconName: "add"
        accessibleName: "Zoom in"
        enabled: controls.viewState.canZoomIn
        onClicked: controls.viewState.zoomBy(0.8, controls.clock.time)
    }
    Ui.ToolbarIconButton {
        objectName: "zoomFit"
        anchors.verticalCenter: parent.verticalCenter
        iconName: "fitScreen"
        accessibleName: "Zoom to fit"
        onClicked: controls.viewState.zoomToFit()
    }
}
