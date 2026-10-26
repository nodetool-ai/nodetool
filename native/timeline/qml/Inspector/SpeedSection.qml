// nt-panel: slot=right id=inspectorSpeed order=30 title="Speed"
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "primitives"

Item {
    id: root
    objectName: "inspectorSpeed"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    property var gestures: typeof tracksRegion !== "undefined" ? tracksRegion.gestures : null
    readonly property var selectedIds: gestures ? gestures.selection : []
    readonly property var document: edits.document
    readonly property var clip: {
        if (selectedIds.length !== 1) return null
        return (document.clips || []).find(c => c.id === selectedIds[0] && c.mediaType !== "midi") || null
    }
    readonly property bool locked: !clip || !!clip.locked || (document.tracks || []).some(t => t.id === clip.trackId && t.locked)
    readonly property bool remapped: !!clip && !!clip.timeRemap && clip.timeRemap.keyframes.length > 0
    width: implicitWidth
    implicitWidth: clip ? 360 : 0
    implicitHeight: clip ? body.implicitHeight : 0
    SpeedController { id: edits; model: root.timelineModel }
    function openSpeedDuration() { speedDuration.openForSelection() }
    function speedPayload(raw) {
        const value = Number(raw)
        if (!root.clip || raw.trim() === "" || !Number.isFinite(value)) return null
        return {clipId: root.clip.id, speedMultiplier: Math.min(8, Math.max(0.1, value)), linked: gestures ? gestures.linkedSelection : true}
    }
    Column {
        id: body
        visible: !!root.clip
        width: parent.width
        spacing: Theme.spacingXs
        InspectorRow {
            width: parent.width
            label: "Speed"
            InspectorPillInput {
                id: speedPill
                objectName: "speedPill"
                property bool scrubbing: false
                property string previewValue: ""
                value: scrubbing ? previewValue : Number(root.clip ? (root.clip.speedMultiplier ?? 1) : 1).toFixed(2)
                unit: "×"
                ariaLabel: "Playback speed"
                scrub: ({step: 0.01, min: 0.1, max: 8})
                disabled: root.locked || root.remapped
                onGestureStarted: {
                    const payload = root.speedPayload(value)
                    if (!disabled && payload) { previewValue = value; scrubbing = true; edits.beginGesture("setClipSpeed", payload) }
                }
                onPreview: raw => {
                    const payload = root.speedPayload(raw)
                    if (!disabled && payload) { previewValue = raw; edits.preview(payload) }
                }
                onCommit: raw => {
                    const payload = root.speedPayload(raw)
                    if (!disabled && payload) edits.commit("setClipSpeed", payload)
                    scrubbing = false
                }
            }
        }
        Text {
            width: parent.width
            visible: root.remapped
            text: "Time Remap sets this clip's speed."
            wrapMode: Text.WordWrap
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
            color: Theme.textSecondary
        }
        SpeedTimeRemap { width: parent.width; clip: root.clip; locked: root.locked; controller: edits }
    }
    SpeedDurationDialog { id: speedDuration; controller: edits; clipIds: root.selectedIds; linked: root.gestures ? root.gestures.linkedSelection : true }
    Shortcut {
        objectName: "speedDurationShortcut"
        sequence: "Ctrl+R"
        enabled: root.selectedIds.length > 0 && (root.document.clips || []).some(c => root.selectedIds.indexOf(c.id) >= 0 && c.mediaType !== "midi")
        onActivated: root.openSpeedDuration()
    }
}
