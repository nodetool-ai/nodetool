// nt-panel: slot=overlay id=vstStateSync order=6 title="VST state sync"
// Keeps open VST3 plug-in editor windows synchronized with the timeline
// document even after popovers close. Instance keys use:
//   inst:<trackId>               -> MIDI track instrument
//   fx:<trackId>:<effectId>      -> Audio/MIDI track VST effect
//   master-fx:<effectId>         -> Master channel VST effect
import QtQuick
import NodeTool.Timeline

Item {
    id: root
    objectName: "vstStateSync"
    property TimelineModel timeline: null

    function findTimeline() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.timeline !== null) return item.timeline
            item = item.parent
        }
        return null
    }

    function applyPluginState(instance, state) {
        const tl = root.timeline || findTimeline()
        if (!tl || !instance) return
        const nextState = state && state.length > 0 ? state : null
        if (instance.startsWith("inst:")) {
            const trackId = instance.slice(5)
            tl.applyEdit("setTrackInstrumentState", { trackId: trackId, state: nextState })
        } else if (instance.startsWith("master-fx:")) {
            const effectId = instance.slice(10)
            tl.applyEdit("updateMasterEffect", { effectId: effectId, patch: { state: nextState } })
        } else if (instance.startsWith("fx:")) {
            const rest = instance.slice(3)
            const sep = rest.indexOf(":")
            if (sep <= 0) return
            const trackId = rest.slice(0, sep)
            const effectId = rest.slice(sep + 1)
            tl.applyEdit("updateTrackEffect", { trackId: trackId, effectId: effectId, patch: { state: nextState } })
        }
    }

    Component.onCompleted: Qt.callLater(() => { root.timeline = findTimeline() })
    onTimelineChanged: VstHost.followTimeline(root.timeline)
    Component.onDestruction: {
        VstHost.followTimeline(null)
        VstHost.closeAllEditors()
    }

    Connections {
        target: root.timeline
        function onDocumentReplaced() { VstHost.closeAllEditors() }
    }

    Connections {
        target: VstHost
        function onPluginStateChanged(instance, state) { root.applyPluginState(instance, state) }
        function onPluginEditorClosed(instance, state) { root.applyPluginState(instance, state) }
    }
}
