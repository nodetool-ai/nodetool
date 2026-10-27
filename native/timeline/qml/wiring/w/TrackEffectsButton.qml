import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline

TrackIconButton {
    id: button
    required property string trackId
    required property TimelineModel timeline
    readonly property bool expanded: TrackEffectsState.expandedFxTrackId === trackId
    readonly property var effects: model.track.effects ?? []
    readonly property string toolTip: effects.length === 0 ? "Effects chain (empty)"
        : "Effects chain (" + effects.length + (effects.length === 1 ? " effect)" : " effects)")
    objectName: "track-fx-" + trackId
    icon: Icons.graphicEq
    tone: expanded || effects.some(e => e.enabled) ? "idle" : "dim"
    onClicked: TrackEffectsState.toggleExpandedFx(trackId)
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: expanded ? "Hide effects chain" : "Show effects chain"
    Accessible.description: toolTip
    Accessible.checkable: true
    Accessible.checked: expanded
    Accessible.pressed: expanded
    Accessible.onPressAction: clicked()
    Keys.onSpacePressed: clicked()
    Keys.onReturnPressed: clicked()
    Controls.ToolTip.visible: hover.hovered
    Controls.ToolTip.delay: 500
    Controls.ToolTip.text: toolTip
    HoverHandler { id: hover }
    TrackEffectsModel { id: model; timeline: button.timeline; trackId: button.trackId }
}
