pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property string messageId
    required property string role
    required property string text
    required property var parts
    required property string status
    required property var session
    readonly property bool userMessage: role === "user"
    spacing: Ui.Metrics.md
    objectName: "message_" + messageId
    Ui.Text { id: userFont; visible: false; role: Ui.Typography.SansBody }
    TextMetrics {
        id: userMetrics
        text: root.userMessage ? root.text.slice(0, 4096) : ""
        font: userFont.font
    }
    component PagedText: ColumnLayout {
        id: paged
        property string sourceText: ""
        property bool markdown: false
        property bool userBubble: false
        property var chatSession
        property int page: 0
        readonly property int pageSize: 4096
        readonly property int pages: Math.max(1, Math.ceil(sourceText.length / pageSize))
        readonly property string pageText: sourceText.slice(Math.min(page, pages - 1) * pageSize, (Math.min(page, pages - 1) + 1) * pageSize)
        spacing: Ui.Metrics.md
        function sections() {
            if (!markdown || pages > 1) {
                return [
                    {
                        text: pageText,
                        code: false
                    }
                ];
            }
            const result = [];
            const pattern = /```[^\n]*\n([\s\S]*?)(?:```|$)/g;
            let cursor = 0;
            let match;
            while ((match = pattern.exec(pageText)) !== null) {
                if (match.index > cursor) {
                    result.push({
                        text: pageText.slice(cursor, match.index),
                        code: false
                    });
                }
                result.push({
                    text: match[1],
                    code: true
                });
                cursor = pattern.lastIndex;
            }
            if (cursor < pageText.length) {
                result.push({
                    text: pageText.slice(cursor),
                    code: false
                });
            }
            return result;
        }
        Repeater {
            model: paged.sections()
            delegate: Ui.TextArea {
                required property var modelData
                Layout.fillWidth: true
                value: modelData.text
                textFormat: !modelData.code && paged.markdown && paged.pages === 1 && !/!\[|<\/?[A-Za-z]/.test(paged.pageText) ? TextEdit.MarkdownText : TextEdit.PlainText
                readOnly: true
                selectByMouse: true
                wrapMode: TextEdit.Wrap
                role: modelData.code ? Ui.Typography.MonoCode : Ui.Typography.SansBody
                variant: paged.userBubble ? Ui.TextArea.Bubble : modelData.code ? Ui.TextArea.Code : Ui.TextArea.Plain
                accessibleName: modelData.text
                onLinkActivated: link => {
                    if (paged.chatSession) {
                        paged.chatSession.openExternal(link);
                    }
                }
            }
        }
        RowLayout {
            visible: paged.pages > 1
            Layout.fillWidth: true
            Ui.EditorButton {
                visible: paged.pages > 1
                text: qsTr("Previous section")
                enabled: paged.page > 0
                onClicked: --paged.page
            }
            Ui.Text {
                role: Ui.Typography.SansLabel
                visible: paged.pages > 1
                text: qsTr("Section %1 of %2 · Plain text").arg(Math.min(paged.page, paged.pages - 1) + 1).arg(paged.pages)
                tone: Ui.Text.Secondary
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
            Ui.EditorButton {
                visible: paged.pages > 1
                text: qsTr("Next section")
                enabled: paged.page < paged.pages - 1
                onClicked: ++paged.page
            }
        }
    }
    Item {
        id: proseContainer
        Layout.fillWidth: !root.userMessage
        Layout.maximumWidth: root.userMessage ? root.width * (root.width < ChatMetrics.narrow ? 0.88 : 0.75) : root.width
        Layout.alignment: root.userMessage ? Qt.AlignRight : Qt.AlignLeft
        implicitWidth: root.userMessage ? Math.min(root.width * (root.width < ChatMetrics.narrow ? 0.88 : 0.75), Math.max(Ui.Metrics.xxxl, Math.ceil(userMetrics.advanceWidth) + Ui.Metrics.xl * 2)) : root.width
        implicitHeight: prose.implicitHeight + (root.userMessage ? 0 : Ui.Metrics.xl * 2)
        PagedText {
            id: prose
            x: root.userMessage ? 0 : Ui.Metrics.xl
            y: x
            width: parent.width - x * 2
            visible: root.text.length > 0
            sourceText: root.text
            markdown: true
            userBubble: root.userMessage
            chatSession: root.session
        }
    }
    Repeater {
        model: root.parts || []
        delegate: Ui.Surface {
            id: partFrame
            required property var modelData
            readonly property var part: modelData
            readonly property string kind: part.type || "unknown"
            Layout.fillWidth: true
            implicitHeight: partContent.implicitHeight + Ui.Metrics.md * 2
            ColumnLayout {
                id: partContent
                anchors.fill: parent
                anchors.margins: Ui.Metrics.md
                spacing: Ui.Metrics.md
                Ui.Text {
                    role: Ui.Typography.SansLabel
                    Layout.fillWidth: true
                    text: partFrame.part.tool_name || partFrame.part.name || partFrame.part.title || partFrame.kind
                    tone: Ui.Text.Secondary
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
                    Layout.preferredHeight: Math.min(implicitHeight, Ui.Metrics.comfortable * 8)
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
                    Ui.TextField {
                        id: response
                        Layout.fillWidth: true
                        visible: partFrame.kind === "plan_approval_request"
                        placeholderText: qsTr("Feedback (optional)")
                        accessibleName: qsTr("Plan feedback")
                    }
                    Ui.EditorButton {
                        visible: partFrame.kind !== "secret_request"
                        text: qsTr("Approve")
                        enabled: !!root.session && root.session.connectionStatus === "connected"
                        onClicked: {
                            root.session.respondToAction(partFrame.part.actionId, true, response.text);
                        }
                    }
                    Ui.EditorButton {
                        text: qsTr("Decline")
                        enabled: !!root.session && root.session.connectionStatus === "connected"
                        onClicked: {
                            root.session.respondToAction(partFrame.part.actionId, false, response.text);
                        }
                    }
                }
            }
        }
    }
    Ui.Text {
        role: Ui.Typography.SansCaption
        visible: root.status === "error"
        text: root.status
        tone: Ui.Text.Error
    }
}
