import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor.Media 1.0

ColumnLayout {
    id: richOutput
    required property var modelData
    // The tab's MediaResolver, for text and image outputs held as media.
    property var resolver: null
    // Web output Actions: a Copy button over text, JSON and value outputs on hover.
    // A Preview card has its own Copy, and nested outputs leave it to the outer one.
    property bool showCopy: true
    readonly property string copyText: (modelData.renderer === "text" || modelData.renderer === "json" || modelData.renderer === "generic") && !modelData.textUri && (!modelData.items || modelData.items.length === 0) ? (modelData.text || "") : ""
    property string copyStatus: ""
    spacing: Ui.Metrics.xs
    HoverHandler { id: outputHover }
    MediaClipboard { id: outputClipboard }
    // Zero height, so the button floats over the output's top right corner.
    Item {
        Layout.fillWidth: true
        Layout.preferredHeight: 0
        visible: richOutput.showCopy && richOutput.copyText.length > 0
        z: Ui.Metrics.layerOverlay
        RowLayout {
            anchors.top: parent.top
            anchors.right: parent.right
            spacing: Ui.Metrics.xs
            visible: outputHover.hovered || richOutput.copyStatus.length > 0
            Ui.Text { objectName: "output-copy-status"; visible: richOutput.copyStatus.length > 0; text: richOutput.copyStatus; role: Ui.Typography.SansCaption }
            Ui.EditorButton {
                objectName: "output-copy"
                text: "Copy"
                accessibleName: "Copy output"
                variant: Ui.EditorButton.Outlined; flat: true
                onClicked: richOutput.copyStatus = outputClipboard.copyText(richOutput.copyText) ? "Copied!" : "Could not copy the output"
            }
        }
    }
    onCopyTextChanged: copyStatus = ""
    ColumnLayout {
        id: pcmOutput
        property var controller: modelData.pcmController || null
        visible: modelData.renderer === "pcm"
        Layout.fillWidth: true
        RowLayout {
            Ui.EditorButton { variant: Ui.EditorButton.Outlined; objectName: "pcm-start-stop"; text: pcmOutput.controller && pcmOutput.controller.playing ? "Stop" : "Start"; accessibleName: text + " streaming audio"; enabled: !!pcmOutput.controller; onClicked: pcmOutput.controller.playing ? pcmOutput.controller.stop() : pcmOutput.controller.start() }
            Ui.EditorButton { variant: Ui.EditorButton.Outlined; objectName: "pcm-restart"; text: "Restart"; accessibleName: "Restart streaming audio"; enabled: !!pcmOutput.controller; onClicked: pcmOutput.controller.restart() }
        }
        LiveAudioVisualizer {
            objectName: "pcm-visualizer"
            visible: !!pcmOutput.controller
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.standard * 2
            controller: pcmOutput.controller
            reducedMotion: Ui.Theme.reducedMotion
            waveColor: Ui.Theme.textPrimary
            firstColor: Ui.Theme.accentSecondary
            secondColor: Ui.Theme.statusWarning
            middleColor: Ui.Theme.statusSuccess
            fourthColor: Ui.Theme.statusInfo
            lastColor: Ui.Theme.accentPrimary
            strokeWidth: Ui.Metrics.focus
            Accessible.role: Accessible.Graphic
            Accessible.name: "Streaming audio visualization"
        }
        Ui.Text { objectName: "pcm-state"; text: pcmOutput.controller ? pcmOutput.controller.state : "Streaming audio is no longer retained"; role: Ui.Typography.SansCaption; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    function likelyMarkdown(text) {
        if (!text || text.length < 6) { return false }
        return /(^|\n)\s{0,3}#{1,6}\s+\S|(^|\n)```|(^|\n)\s{0,3}[-*+]\s+\S|(^|\n)\s{0,3}\d+\.\s+\S|\[[^\]]+\]\([^)]+\)|(^|\n)\s{0,3}>\s+\S|(^|\n)\|[^\n]*\||`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_/.test(text)
    }
ColumnLayout {
    id: tool
    property bool expanded: false
    visible: modelData.renderer === "tool_call"
    Layout.fillWidth: true
    Ui.EditorButton {
        objectName: "output-tool-toggle"
        text: ["TOOL", modelData.toolName || "tool", tool.expanded ? "" : modelData.toolSummary, modelData.toolId ? (modelData.toolId.length > 12 ? modelData.toolId.slice(0, 8) + "…" : modelData.toolId) : "", tool.expanded ? "⌄" : "›"].filter(Boolean).join("  ")
        accessibleName: text + (tool.expanded ? " Hide arguments" : " Show arguments")
        variant: Ui.EditorButton.Outlined; flat: true
        onClicked: tool.expanded = !tool.expanded
    }
    Ui.TextArea {
        visible: tool.expanded
        Layout.fillWidth: true
        readOnly: true
        variant: Ui.TextArea.Plain
        role: Ui.Typography.MonoCode
        value: modelData.toolArgs || ""
    }
}
Loader {
    Layout.fillWidth: true
    active: modelData.renderer === "image_comparison"
    visible: active
    sourceComponent: Component { ImageComparisonOutput { comparison: modelData.comparison; resolver: richOutput.resolver } }
}
Loader {
    Layout.fillWidth: true
    active: modelData.renderer === "dataframe"
    visible: active
    sourceComponent: Component { DataframeOutput { modelData: richOutput.modelData } }
}
// AgentStatusRenderer.tsx: an accent bar, an icon, the kind's label and the message.
Rectangle {
    id: agentStatus
    objectName: "output-agent-status"
    visible: modelData.renderer === "agent_status"
    readonly property string severity: modelData.statusSeverity || "info"
    readonly property string kind: modelData.statusKind || "log"
    readonly property color accent: severity === "error" ? Ui.Theme.statusError : severity === "warning" ? Ui.Theme.statusWarning
        : kind === "planning" ? Ui.Theme.statusInfo : kind === "task" ? Ui.Theme.statusSuccess : kind === "tool_call" ? Ui.Theme.accentPrimary : Ui.Theme.textSecondary
    Layout.fillWidth: true
    implicitHeight: statusRow.implicitHeight + Ui.Metrics.sm * 2
    radius: Ui.Metrics.radiusControl
    color: Qt.alpha(accent, 0.08)
    Rectangle { width: Ui.Metrics.focus; height: parent.height; color: agentStatus.accent }
    RowLayout {
        id: statusRow
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.lg
        anchors.rightMargin: Ui.Metrics.lg
        anchors.topMargin: Ui.Metrics.sm
        anchors.bottomMargin: Ui.Metrics.sm
        spacing: Ui.Metrics.sm
        Ui.Icon {
            objectName: "output-agent-status-icon"
            Layout.alignment: Qt.AlignTop
            name: agentStatus.severity === "error" ? "error" : agentStatus.severity === "warning" ? "warning" : agentStatus.kind === "planning" ? "autoAwesome"
                : agentStatus.kind === "task" ? "descriptionOutlined" : agentStatus.kind === "tool_call" ? "wrench" : "info"
            domainColor: agentStatus.accent
        }
        Ui.Text {
            objectName: "output-agent-status-label"
            Layout.alignment: Qt.AlignTop
            text: (modelData.statusLabel || "log").toUpperCase()
            role: Ui.Typography.SansCaption
            domainColor: agentStatus.accent
        }
        Ui.Text {
            objectName: "output-agent-status-text"
            Layout.fillWidth: true
            text: modelData.text || ""
            textFormat: Text.PlainText
            role: Ui.Typography.MonoCaption
            wrapMode: Text.Wrap
        }
    }
}
Ui.Text {
    visible: modelData.renderer === "plotly" || (modelData.renderer === "object" && !!modelData.objectNotice)
    Layout.fillWidth: true
    role: Ui.Typography.SansCaption
    text: modelData.renderer === "plotly" ? "Plotly chart unavailable in native editor. Configuration and data:" : (modelData.objectNotice || "")
    wrapMode: Text.Wrap
}
ObjectOutput {
    visible: modelData.renderer === "object"
    Layout.fillWidth: true
    fields: modelData.fields || []
    resolver: richOutput.resolver
}
Repeater {
    model: modelData.renderer === "sequence" ? modelData.children : []
    Loader {
        required property var modelData
        Layout.fillWidth: true
        Component.onCompleted: setSource("RichOutput.qml", {modelData: modelData, resolver: richOutput.resolver, showCopy: false})
    }
}
TextOutput {
    visible: modelData.renderer === "text"
    Layout.fillWidth: true
    output: modelData
    resolver: richOutput.resolver
}
Ui.TextArea {
    objectName: "run-output-text"
    id: plainOutput
    visible: modelData.renderer !== "pcm" && modelData.renderer !== "text" && modelData.renderer !== "sequence" && (!modelData.items || modelData.items.length === 0) && modelData.renderer !== "dataframe" && modelData.renderer !== "object" && modelData.renderer !== "tool_call" && modelData.renderer !== "image_comparison" && modelData.renderer !== "agent_status"
    Layout.fillWidth: true
    variant: Ui.TextArea.Plain
    role: modelData.renderer === "text" ? Ui.Typography.SansBody : Ui.Typography.MonoCode
    accessibleName: "Run output"
    readOnly: true
    textFormat: modelData.renderer === "text" && likelyMarkdown(modelData.text) ? TextEdit.MarkdownText : TextEdit.PlainText
    value: modelData.text || ""
    wrapMode: TextEdit.WrapAnywhere
}
// JSONRenderer.tsx colors JSON tokens with Prism. Optional, as in CodePropertyEditor.qml.
Loader {
    objectName: "output-json-syntax"
    active: modelData.renderer === "json"
    source: "CodeSyntax.qml"
    onLoaded: item.target = Qt.binding(() => plainOutput.textDocument)
}
}
