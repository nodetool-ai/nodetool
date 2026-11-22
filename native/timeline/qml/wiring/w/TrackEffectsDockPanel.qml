// nt-panel: slot=bottom id=trackEffects order=108 title="Effect Chain"
// Dockable panel showing the active track's instrument and DSP effect chain.
// Auto-opens when clicking the effect chain button on any track header.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: root
    objectName: "trackEffectsDockPanel"
    variant: Ui.Surface.Canvas
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: 280

    property var editor: null
    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined) return item
            item = item.parent
        }
        return null
    }
    function attach() { editor = editorAbove() }

    Component.onCompleted: {
        TrackEffectsState.panelVisible = visible
        Qt.callLater(attach)
    }
    onParentChanged: Qt.callLater(attach)
    onVisibleChanged: TrackEffectsState.panelVisible = visible
    Component.onDestruction: TrackEffectsState.panelVisible = false

    TrackEffectsModel {
        id: trackModel
        timeline: root.editor ? root.editor.timeline : null
        trackId: TrackEffectsState.expandedFxTrackId
    }

    readonly property bool hasTrack: !!root.editor && !!root.editor.timeline && !!trackModel.track && !!trackModel.track.id

    Loader {
        id: panelLoader
        anchors.fill: parent
        active: root.hasTrack
        sourceComponent: TrackEffectsPanel {
            track: trackModel.track
            timeline: root.editor.timeline
        }
    }

    Ui.Text {
        objectName: "track-effects-empty-state"
        visible: !root.hasTrack
        anchors.centerIn: parent
        width: Math.min(parent.width - 2 * Ui.Metrics.lg, Ui.Metrics.xxxl * 8)
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WordWrap
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        text: qsTr("Click the effect chain button on a track to view and edit its instruments and effects.")
    }
}
