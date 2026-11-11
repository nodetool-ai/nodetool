// nt-panel: slot=overlay id=frameHold order=46 title="Frame hold"
// The Clip menu's frame hold commands (issue 7087). A hold is a constant time
// remap, edited by src/edit/framehold/. Each command is one undo entry.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "frameHoldHost"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    property var gestures: null
    property var clipIds: []
    property string insertClipId: ""
    property string holdOn: "in"
    property string openedStamp: ""
    property double openedHeldMs: -1
    // Read when a command starts. A binding would run on every frame of playback.
    property double playheadMs: 0
    readonly property double fps: timelineModel ? timelineModel.fps : 30
    readonly property bool timeModeUsed: holdOn === "sequenceTime" || holdOn === "sourceTime"
    readonly property double parsedTimeMs: {
        if (!timeModeUsed)
            return 0
        const dropFrame = holdOn === "sequenceTime" && timelineModel ? timelineModel.dropFrame : false
        return TimelineFormat.parseTimecode(timeField.text, fps, dropFrame, playheadMs)
    }
    readonly property bool timeValid: !timeModeUsed || (Number.isFinite(parsedTimeMs) && parsedTimeMs >= 0)

    FrameHoldController {
        id: controller
        timeline: root.timelineModel
    }

    function begin(gestureController) {
        gestures = gestureController
        playheadMs = gestures && gestures.clock ? gestures.clock.time : 0
    }
    function targets(context) {
        const given = context && context.clipIds ? context.clipIds : []
        // A clip chosen from its context menu is the only target: never fall through to another track.
        if (given.length > 0)
            return controller.targetsAt(given, playheadMs).filter(id => given.includes(id))
        return controller.targetsAt(gestures ? gestures.selection : [], playheadMs)
    }
    function explain(text) {
        reasonText.text = text
        reasonDialog.open()
        return true
    }
    function finish(result) {
        if (!result.ok)
            return explain(result.error)
        if (gestures && result.clipIds.length > 0)
            gestures.selection = result.clipIds
        return true
    }
    function add(gestureController, context) {
        begin(gestureController)
        const ids = targets(context)
        if (ids.length === 0)
            return explain("Place the playhead over a video clip.")
        return finish(controller.add(ids, playheadMs))
    }
    function openInsert(gestureController, context) {
        begin(gestureController)
        const ids = targets(context)
        if (ids.length === 0)
            return explain("Place the playhead over a video clip.")
        insertClipId = ids[0]
        insertDialog.open()
        lengthField.forceActiveFocus()
        lengthField.selectAll()
        return true
    }
    function applyInsert() {
        if (!lengthField.draftValid)
            return
        const result = controller.insertSegment(insertClipId, playheadMs, Number(lengthField.text) * 1000)
        insertDialog.close()
        finish(result)
    }
    function openOptions(gestureController, context) {
        begin(gestureController)
        const given = context && context.clipIds ? context.clipIds : []
        const ids = given.length > 0 ? given : (gestures ? gestures.selection : [])
        const clips = (ids || []).map(id => controller.clipJson(id)).filter(clip => clip.mediaType === "video")
        if (clips.length === 0)
            return explain("Select a video clip.")
        clipIds = clips.map(clip => clip.id)
        const held = controller.holdSourceMs(clips[0].id)
        enabledBox.checked = held >= 0
        holdOn = held >= 0 ? "sourceTime" : "in"
        const stamp = TimelineFormat.timecode(held >= 0 ? held : playheadMs, fps, false)
        timeField.value = stamp
        timeField.text = stamp
        // The field rounds to a sequence frame, so an untouched field must send the exact held time.
        openedStamp = stamp
        openedHeldMs = held
        optionsError.text = ""
        optionsDialog.open()
        return true
    }
    function applyOptions() {
        if (!timeValid)
            return
        const untouched = holdOn === "sourceTime" && openedHeldMs >= 0 && timeField.text === openedStamp
        const result = controller.setOptions({
            clipIds: clipIds, enabled: enabledBox.checked, holdOn: holdOn,
            playheadMs: playheadMs, timeMs: untouched ? openedHeldMs : parsedTimeMs
        })
        if (!result.ok && !result.unchanged && enabledBox.checked) {
            optionsError.text = result.error
            return
        }
        optionsDialog.close()
        if (result.ok)
            finish(result)
    }

    Ui.Dialog {
        id: insertDialog
        objectName: "frameHoldInsertDialog"
        title: "Insert frame hold segment"
        width: Math.min(Math.max(root.width - 2 * Ui.Metrics.dialogNarrowInset, 0), Ui.Metrics.dialogCompactWidth)
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.md
            Ui.Text {
                Layout.fillWidth: true
                text: "Splits the clip at the playhead and pushes the rest later. Linked audio splits too, with a gap under the hold."
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                wrapMode: Text.Wrap
            }
            Ui.Text { text: "Length"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
            Ui.NumberField {
                id: lengthField
                objectName: "frameHoldLength"
                Layout.fillWidth: true
                accessibleName: "Hold length in seconds"
                unit: "s"
                value: 2
                from: 0.001
                to: 3600
                stepSize: 0.5
                onAccepted: root.applyInsert()
            }
        }
        footer: Row {
            spacing: Ui.Metrics.md
            padding: Ui.Metrics.lg
            layoutDirection: Qt.RightToLeft
            Ui.EditorButton {
                objectName: "frameHoldInsertApply"
                text: "Insert"
                variant: Ui.EditorButton.Primary
                enabled: lengthField.draftValid
                onClicked: root.applyInsert()
            }
            Ui.EditorButton { text: "Cancel"; onClicked: insertDialog.close() }
        }
    }

    Ui.Dialog {
        id: optionsDialog
        objectName: "frameHoldOptionsDialog"
        title: "Frame hold options"
        width: Math.min(Math.max(root.width - 2 * Ui.Metrics.dialogNarrowInset, 0), Ui.Metrics.dialogCompactWidth)
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.md
            Ui.CheckBox {
                id: enabledBox
                objectName: "frameHoldEnabled"
                text: "Hold the frame"
            }
            Ui.Text { text: "Hold on"; role: Ui.Typography.SansLabel; tone: enabledBox.checked ? Ui.Text.Secondary : Ui.Text.Disabled }
            Ui.Select {
                objectName: "frameHoldOn"
                Layout.fillWidth: true
                accessibleName: "Hold on"
                enabled: enabledBox.checked
                options: [
                    {label: "In point", value: "in"},
                    {label: "Out point", value: "out"},
                    {label: "Playhead", value: "playhead"},
                    {label: "Sequence time", value: "sequenceTime"},
                    {label: "Source time", value: "sourceTime"}
                ]
                value: root.holdOn
                onValueCommitted: next => root.holdOn = next
            }
            Ui.TextField {
                id: timeField
                objectName: "frameHoldTime"
                Layout.fillWidth: true
                visible: root.timeModeUsed
                enabled: enabledBox.checked
                accessibleName: root.holdOn === "sourceTime" ? "Source time" : "Sequence time"
                valid: root.timeValid
                errorText: "Enter a timecode such as 00:00:04:12."
                onAccepted: root.applyOptions()
            }
            Ui.Text {
                id: optionsError
                objectName: "frameHoldOptionsError"
                Layout.fillWidth: true
                visible: text !== ""
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Error
                wrapMode: Text.Wrap
            }
        }
        footer: Row {
            spacing: Ui.Metrics.md
            padding: Ui.Metrics.lg
            layoutDirection: Qt.RightToLeft
            Ui.EditorButton {
                objectName: "frameHoldOptionsApply"
                text: "Apply"
                variant: Ui.EditorButton.Primary
                enabled: root.timeValid
                onClicked: root.applyOptions()
            }
            Ui.EditorButton { text: "Cancel"; onClicked: optionsDialog.close() }
        }
    }

    Ui.Dialog {
        id: reasonDialog
        objectName: "frameHoldReasonDialog"
        title: "Frame hold"
        width: Math.min(Math.max(root.width - 2 * Ui.Metrics.dialogNarrowInset, 0), Ui.Metrics.dialogCompactWidth)
        contentItem: Ui.Text {
            id: reasonText
            objectName: "frameHoldReason"
            wrapMode: Text.Wrap
            role: Ui.Typography.SansBody
        }
        footer: Row {
            spacing: Ui.Metrics.md
            padding: Ui.Metrics.lg
            layoutDirection: Qt.RightToLeft
            Ui.EditorButton {
                objectName: "frameHoldReasonClose"
                text: "Close"
                variant: Ui.EditorButton.Primary
                onClicked: reasonDialog.close()
            }
        }
    }
}
