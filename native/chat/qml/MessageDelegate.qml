pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ColumnLayout {
    id: root
    required property string messageId
    required property string role
    required property string text
    required property string timestamp
    required property var parts
    required property string status
    required property var session
    spacing: ChatTheme.md
    objectName: "message_" + messageId
    function codeBlocks(source) {
        const blocks = []
        if (source.indexOf("```") < 0) return blocks
        const pattern = /```[^\n]*\n([\s\S]*?)(?:```|$)/g
        let match
        while ((match = pattern.exec(source)) !== null && blocks.length < 100) blocks.push(match[1])
        return blocks
    }
    RowLayout {
        Layout.fillWidth: true
        Label { text: root.role === "user" ? qsTr("You") : root.role === "assistant" ? qsTr("Agent") : root.role; color: ChatTheme.text; font.weight: Font.DemiBold; font.pixelSize: ChatTheme.label }
        Label { text: root.timestamp; color: ChatTheme.muted; font.pixelSize: ChatTheme.caption; Layout.fillWidth: true }
        Label { text: root.status; color: root.status === "error" ? ChatTheme.error : ChatTheme.muted; font.pixelSize: ChatTheme.caption }
    }
    component PagedText: ColumnLayout {
        id: paged
        property string sourceText: ""
        property bool markdown: false
        property var chatSession
        property int page: 0
        readonly property int pageSize: 4096
        readonly property int pages: Math.max(1, Math.ceil(sourceText.length / pageSize))
        readonly property string pageText: sourceText.slice(Math.min(page, pages - 1) * pageSize, (Math.min(page, pages - 1) + 1) * pageSize)
        spacing: ChatTheme.md
        TextArea {
            Layout.fillWidth: true
            text: paged.pageText
            textFormat: paged.markdown && paged.pages === 1 && !/!\[|<\/?[A-Za-z]/.test(paged.pageText) ? TextEdit.MarkdownText : TextEdit.PlainText
            readOnly: true
            selectByMouse: true
            wrapMode: TextEdit.Wrap
            padding: 0
            color: ChatTheme.text
            selectionColor: ChatTheme.primary
            font.family: ChatTheme.sans
            font.pixelSize: ChatTheme.body
            background: null
            Accessible.name: paged.pageText
            onLinkActivated: link => { if (paged.chatSession) paged.chatSession.openExternal(link) }
        }
        RowLayout {
            Layout.fillWidth: true
            ChatButton { visible: paged.pages > 1; text: qsTr("Previous section"); enabled: paged.page > 0; onClicked: --paged.page }
            Label { visible: paged.pages > 1; text: qsTr("Section %1 of %2 · Plain text").arg(Math.min(paged.page, paged.pages - 1) + 1).arg(paged.pages); color: ChatTheme.muted; wrapMode: Text.WordWrap; Layout.fillWidth: true }
            ChatButton { visible: paged.pages > 1; text: qsTr("Next section"); enabled: paged.page < paged.pages - 1; onClicked: ++paged.page }
        }
        ChatButton { text: qsTr("Copy full text"); onClicked: paged.chatSession.copyText(paged.sourceText) }
    }
    PagedText {
        Layout.fillWidth: true
        visible: root.text.length > 0
        sourceText: root.text
        markdown: true
        chatSession: root.session
    }
    Repeater {
        model: root.codeBlocks(root.text)
        delegate: ChatButton {
            required property string modelData
            required property int index
            text: qsTr("Copy code %1").arg(index + 1)
            onClicked: root.session.copyText(modelData)
        }
    }
    Repeater {
        model: root.parts || []
        delegate: Frame {
            id: partFrame
            required property var modelData
            readonly property var part: modelData
            readonly property string kind: part.type || "unknown"
            Layout.fillWidth: true
            padding: ChatTheme.md
            background: Rectangle { color: ChatTheme.paper; radius: ChatTheme.radius; border.color: ChatTheme.divider }
            ColumnLayout {
                width: parent.width
                spacing: ChatTheme.md
                Label {
                    Layout.fillWidth: true
                    text: partFrame.part.tool_name || partFrame.part.name || partFrame.part.title || partFrame.kind
                    color: ChatTheme.muted
                    font.pixelSize: ChatTheme.label
                    wrapMode: Text.WordWrap
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: !!partFrame.part.actionId
                    sourceText: (partFrame.part.message || "") + (partFrame.part.args ? "\n" + JSON.stringify(partFrame.part.args, null, 2) : "")
                    chatSession: root.session
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: partFrame.kind !== "image" || !partFrame.part.mediaUrl
                    sourceText: partFrame.part.text || partFrame.part.content || (typeof partFrame.part.result === "string" ? partFrame.part.result : "") || qsTr("This content is preserved by the server. Open the web app to use this content type.")
                    chatSession: root.session
                }
                Image {
                    Layout.fillWidth: true
                    Layout.preferredHeight: Math.min(implicitHeight, ChatTheme.control * 8)
                    visible: partFrame.kind === "image" && String(partFrame.part.mediaUrl || "").indexOf("data:image/") === 0
                    source: visible ? partFrame.part.mediaUrl : ""
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                    cache: false
                    Accessible.name: partFrame.part.name || qsTr("Image result")
                }
                RowLayout {
                    visible: ["tool_approval_request", "plan_approval_request", "secret_request"].indexOf(partFrame.kind) >= 0 && !!partFrame.part.actionId && !!partFrame.part.pending
                    Layout.fillWidth: true
                    TextField { id: response; Layout.fillWidth: true; visible: partFrame.kind === "plan_approval_request"; placeholderText: qsTr("Feedback (optional)"); Accessible.name: qsTr("Plan feedback") }
                    ChatButton {
                        visible: partFrame.kind !== "secret_request"
                        text: qsTr("Approve")
                        enabled: !!root.session && root.session.connectionStatus === "connected"
                        onClicked: { root.session.respondToAction(partFrame.part.actionId, true, response.text) }
                    }
                    ChatButton {
                        text: qsTr("Decline")
                        enabled: !!root.session && root.session.connectionStatus === "connected"
                        onClicked: { root.session.respondToAction(partFrame.part.actionId, false, response.text) }
                    }
                }
            }
        }
    }
    Rectangle { Layout.fillWidth: true; height: 1; color: ChatTheme.divider }
}
