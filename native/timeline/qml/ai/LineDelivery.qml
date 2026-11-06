import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property TimelineModel timeline
    required property ClipGestureController gestures
    required property var controller
    readonly property string clipId: gestures && gestures.selection.length === 1 ? gestures.selection[0] : ""
    readonly property var selectedClip: inspector.clip
    visible: clipId !== "" && selectedClip.mediaType === "audio" && !!selectedClip.scriptId && !!selectedClip.scriptLineId
    readonly property var script: scriptLoader.result && scriptLoader.result.id === selectedClip.scriptId ? scriptLoader.result.document : null
    readonly property var line: {
        const sections = script ? (script.sections || []) : []
        for (const section of sections) for (const item of (section.lines || []))
            if (item.id === selectedClip.scriptLineId) return item
        return null
    }
    readonly property var voice: {
        if (!line) return null
        if (line.voiceOverride) return line.voiceOverride
        for (const member of (script.cast || [])) if (member.id === line.speakerId) return member.voice || null
        return null
    }
    onVisibleChanged: if (visible) scriptLoader.openClipScript(clipId)
    onClipIdChanged: if (visible) scriptLoader.openClipScript(clipId)
    ClipInspectorController { id: inspector; timeline: root.timeline; clipId: root.clipId }
    AssistController { id: scriptLoader; timeline: root.timeline }
    Ui.Text { role: Ui.Typography.SansLabel; text: "Revise line delivery"; }
    Ui.Text { role: Ui.Typography.SansLabel;
        Layout.fillWidth: true
        tone: scriptLoader.error !== "" ? Ui.Text.Error : Ui.Text.Secondary
        wrapMode: Text.Wrap
        text: scriptLoader.busy ? "Loading line…" : scriptLoader.error !== "" ? scriptLoader.error :
              !root.line ? "Script line unavailable." : !root.voice ? "Assign a voice to this line first." :
              "Voice: " + (root.voice.voice || "") + " — " + (root.line.text || "")
    }
    Ui.TextArea {
        id: instructions
        objectName: "lineDeliveryInstructions"
        Layout.fillWidth: true
        Layout.preferredHeight: 80
        wrapMode: TextEdit.Wrap
        placeholderText: "Describe the delivery"
        accessibleName: "Delivery instructions"
    }
    Ui.EditorButton {
        objectName: "lineDeliverySubmit"
        text: "Revise line delivery"
        enabled: root.controller.ready && !root.controller.busy && !inspector.locked && !!root.voice && !scriptLoader.busy
        onClicked: root.controller.submitLineDelivery(root.clipId, { instructions: instructions.text.trim() })
    }
}
