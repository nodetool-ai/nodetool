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
    iconKey: "graphicEq"
    tone: expanded || effects.some(e => e.enabled) ? "idle" : "dim"
    onClicked: TrackEffectsState.toggleExpandedFx(trackId)
    activeFocusOnTab: true
    accessibleName: expanded ? "Hide effects chain" : "Show effects chain"
    description: toolTip
    Accessible.checkable: true
    Accessible.checked: expanded
    TrackEffectsModel { id: model; timeline: button.timeline; trackId: button.trackId }
}
