// Mirrors web/src/components/timeline/Tracks/TimelineZoomControls.tsx.
import QtQuick
import QtQuick.Controls.Basic
import NodeTool.Timeline

Row {
    id: controls
    required property TracksRegion region
    spacing: 4

    Button {
        text: "−"
        focusPolicy: Qt.NoFocus
        onClicked: controls.region.pxPerMs = Math.max(0.005, controls.region.pxPerMs / 1.5)
    }
    Button {
        text: "+"
        focusPolicy: Qt.NoFocus
        onClicked: controls.region.pxPerMs = Math.min(2, controls.region.pxPerMs * 1.5)
    }
    Button {
        text: "Fit"
        focusPolicy: Qt.NoFocus
        onClicked: controls.region.fit()
    }
}
