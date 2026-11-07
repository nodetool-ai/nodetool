import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
ColumnLayout {
    id: root
    required property var output
    property string requestKey: "text-" + String(root)
    property bool ready: false
    property string content: ""
    property string failure: ""
    property bool loading: false
    property string pendingLink: ""
    function reset() {
        mediaResolver.cancel(requestKey)
        mediaResolver.release(requestKey)
        content = ""; failure = ""; loading = false; pendingLink = ""
    }
    function load() {
        reset()
        if (!output.textUri) return
        loading = true
        mediaResolver.resolve(requestKey, output.textUri)
    }
    onOutputChanged: if (ready) load()
    Component.onCompleted: { ready = true; load() }
    Component.onDestruction: reset()
    Connections {
        target: mediaResolver
        function onResolved(key, url) {
            if (key !== root.requestKey) return
            root.content = mediaResolver.resolvedText(key)
            root.loading = false
        }
        function onFailed(key, message) {
            if (key !== root.requestKey) return
            root.loading = false; root.failure = message
        }
        function onCleared() { root.reset() }
    }
    Ui.Text { visible: root.loading; text: "Loading text…"; role: Ui.Typography.SansCaption }
    Ui.Text { visible: root.failure.length > 0; text: root.failure; role: Ui.Typography.SansCaption }
    NodeButton {
        objectName: "output-text-retry"
        visible: root.failure.length > 0 || (!!root.output.textUri && !root.loading && !root.content)
        text: "Retry text"
        onClicked: root.load()
    }
    // A pending Qt.callLater outlives a delegate destroyed by a history change.
    Timer { id: styleTimer; interval: 0; onTriggered: renderedText.style() }
    Ui.TextArea {
        id: renderedText
        property bool styling: false
        function style() {
            if (styling) return
            styling = true
            editor.styleOutputMarkdown(textDocument, Ui.Theme.accentPrimary, Ui.Theme.surfaceOverlay, Ui.Typography.font(Ui.Typography.MonoCode))
            styling = false
        }
        onTextChanged: if (!styling) styleTimer.restart()
        Component.onCompleted: styleTimer.restart()
        Connections {
            target: Ui.Theme
            function onDarkChanged() { renderedText.style() }
            function onTextScaleChanged() { renderedText.style() }
            function onUiScaleChanged() { renderedText.style() }
        }
        objectName: "run-output-text"
        Layout.fillWidth: true
        variant: Ui.TextArea.Plain
        role: Ui.Typography.SansBody
        readOnly: true
        palette.link: Ui.Theme.accentPrimary
        textFormat: TextEdit.MarkdownText
        value: root.output.textUri ? root.content : (root.output.text || "")
        wrapMode: TextEdit.WrapAnywhere
        onLinkActivated: link => {
            root.pendingLink = /^https?:\/\/[^\s@]+$/i.test(link) ? link : ""
        }
    }
    NodeButton {
        objectName: "output-open-link"
        visible: root.pendingLink.length > 0
        text: "Open " + root.pendingLink
        onClicked: { Qt.openUrlExternally(root.pendingLink); root.pendingLink = "" }
    }
}
