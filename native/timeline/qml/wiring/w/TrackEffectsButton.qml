pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline

TrackIconButton {
    id: button
    required property string trackId
    required property TimelineModel timeline
    readonly property bool expanded: TrackEffectsState.panelVisible && TrackEffectsState.expandedFxTrackId === trackId
    // JSON data from the document, controller, or shared JavaScript API.
    readonly property var effects: model.track.effects ?? []
    readonly property string toolTip: effects.length === 0 ? "Effects chain (empty)"
        : "Effects chain (" + effects.length + (effects.length === 1 ? " effect)" : " effects)")
    objectName: "track-fx-" + trackId
    iconKey: "graphicEq"
    tone: expanded || effects.some(e => e.enabled) ? "idle" : "dim"
    function editorAbove() {
        let p = parent
        while (p) {
            if (p.dockStore !== undefined && p.dockCanvas !== undefined) return p
            p = p.parent
        }
        return null
    }
    function regionOfGroup(layout, groupId) {
        const regions = ["left", "right", "bottom", "viewport"]
        for (let i = 0; i < regions.length; ++i) {
            const list = layout && layout.regions ? (layout.regions[regions[i]] || []) : []
            if (list.some(g => g.id === groupId)) return regions[i]
        }
        return "bottom"
    }
    onClicked: {
        const editor = editorAbove()
        const store = editor ? editor.dockStore : null
        const canvas = editor ? editor.dockCanvas : null
        if (expanded) {
            TrackEffectsState.expandedFxTrackId = ""
            if (store) store.dispatch({type: "hide", panelId: "trackEffects"})
            return
        }
        TrackEffectsState.expandedFxTrackId = trackId
        if (canvas && store) {
            const fxGroup = canvas.groupIdOfPanel("trackEffects")
            const tracksGroup = canvas.groupIdOfPanel("tracks")
            if (fxGroup && fxGroup === tracksGroup) {
                const region = regionOfGroup(store.layout, tracksGroup)
                const zone = region === "left" || region === "right" ? "bottom" : "right"
                canvas.dropPanel("trackEffects", {kind: "zone", region: region, groupId: tracksGroup, zone: zone})
            }
            canvas.revealPanel("trackEffects")
        } else if (store) {
            store.dispatch({type: "reveal", panelId: "trackEffects"})
        }
    }
    activeFocusOnTab: true
    accessibleName: expanded ? "Hide effects chain" : "Show effects chain"
    description: toolTip
    Accessible.checkable: true
    Accessible.checked: expanded
    TrackEffectsModel { id: model; timeline: button.timeline; trackId: button.trackId }
}
