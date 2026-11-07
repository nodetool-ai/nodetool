import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: richOutput
    required property var modelData
    spacing: Ui.Metrics.xs
    ColumnLayout {
        visible: modelData.renderer === "pcm"
        Layout.fillWidth: true
        RowLayout {
            NodeButton { objectName: "pcm-start-stop"; text: runOutput.pcm.playing ? "Stop" : "Start"; accessibleName: text + " streaming audio"; onClicked: runOutput.pcm.playing ? runOutput.pcm.stop() : runOutput.pcm.start() }
            NodeButton { objectName: "pcm-restart"; text: "Restart"; accessibleName: "Restart streaming audio"; onClicked: runOutput.pcm.restart() }
        }
        Ui.Text { objectName: "pcm-state"; text: runOutput.pcm.state; role: Ui.Typography.SansCaption; wrapMode: Text.Wrap; Layout.fillWidth: true }
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
    NodeButton {
        objectName: "output-tool-toggle"
        text: ["TOOL", modelData.toolName || "tool", tool.expanded ? "" : modelData.toolSummary, modelData.toolId ? (modelData.toolId.length > 12 ? modelData.toolId.slice(0, 8) + "…" : modelData.toolId) : "", tool.expanded ? "⌄" : "›"].filter(Boolean).join("  ")
        accessibleName: text + (tool.expanded ? " Hide arguments" : " Show arguments")
        variant: NodeButton.Flat
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
    sourceComponent: Component { ImageComparisonOutput { comparison: modelData.comparison } }
}
Loader {
    Layout.fillWidth: true
    active: modelData.renderer === "dataframe"
    visible: active
    sourceComponent: Component { DataframeOutput { modelData: richOutput.modelData } }
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
}
Repeater {
    model: modelData.renderer === "sequence" ? modelData.children : []
    Loader {
        required property var modelData
        Layout.fillWidth: true
        Component.onCompleted: setSource("RichOutput.qml", {modelData: modelData})
    }
}
TextOutput {
    visible: modelData.renderer === "text"
    Layout.fillWidth: true
    output: modelData
}
Ui.TextArea {
    objectName: "run-output-text"
    visible: modelData.renderer !== "pcm" && modelData.renderer !== "text" && modelData.renderer !== "sequence" && (!modelData.items || modelData.items.length === 0) && modelData.renderer !== "dataframe" && modelData.renderer !== "object" && modelData.renderer !== "tool_call" && modelData.renderer !== "image_comparison"
    Layout.fillWidth: true
    variant: Ui.TextArea.Plain
    role: modelData.renderer === "text" ? Ui.Typography.SansBody : Ui.Typography.MonoCode
    accessibleName: "Run output"
    readOnly: true
    textFormat: modelData.renderer === "text" && likelyMarkdown(modelData.text) ? TextEdit.MarkdownText : TextEdit.PlainText
    value: modelData.text || ""
    wrapMode: TextEdit.WrapAnywhere
}
}
