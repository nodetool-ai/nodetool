// Mirrors web/src/components/timeline/Tracks/TimelineZoomControls.tsx: the
// horizontal zoom, inline in the timeline toolbar. Zoom out (x1.25), the
// log-scale slider, zoom in (x0.8), zoom to fit. A step or slider zoom keeps
// the playhead at its viewport x; it reads the clock once, on the click.
import QtQuick
import NodeTool.Timeline

Row {
    id: controls
    objectName: "timelineZoomControls"
    required property TimelineViewState viewState
    required property PlaybackClock clock
    // Narrow toolbar: keep the step buttons, drop the slider.
    property bool compact: false
    spacing: Theme.spacingXs

    ZoomStepButton {
        objectName: "zoomOut"
        anchors.verticalCenter: parent.verticalCenter
        icon: Icons.remove
        enabledState: controls.viewState.canZoomOut
        onClicked: controls.viewState.zoomBy(1.25, controls.clock.time)
    }
    CompactSlider {
        objectName: "zoomSlider"
        visible: !controls.compact
        anchors.verticalCenter: parent.verticalCenter
        width: 96
        from: 0
        to: 100
        stepSize: 1
        value: controls.viewState.zoomSliderValue
        onMoved: controls.viewState.zoomFromSlider(value, controls.clock.time)
    }
    ZoomStepButton {
        objectName: "zoomIn"
        anchors.verticalCenter: parent.verticalCenter
        icon: Icons.add
        enabledState: controls.viewState.canZoomIn
        onClicked: controls.viewState.zoomBy(0.8, controls.clock.time)
    }
    ZoomStepButton {
        objectName: "zoomFit"
        anchors.verticalCenter: parent.verticalCenter
        icon: Icons.fitScreen
        onClicked: controls.viewState.zoomToFit()
    }
}
