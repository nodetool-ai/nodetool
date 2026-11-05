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
        property bool monospaced: false
        property string copyLabel: ""
        property bool userBubble: false
        property var chatSession
        property int page: 0
        readonly property int pageSize: 4096
        readonly property var documentPages: markdown && chatSession ? chatSession.markdownPages(sourceText) : []
        readonly property int pages: markdown ? Math.max(1, documentPages.length) : Math.max(1, Math.ceil(sourceText.length / pageSize))
        readonly property string pageText: sourceText.slice(Math.min(page, pages - 1) * pageSize, (Math.min(page, pages - 1) + 1) * pageSize)
        spacing: Ui.Metrics.md
        Repeater {
            model: paged.markdown ? (paged.documentPages[Math.min(paged.page, paged.pages - 1)] || []) : [{text: paged.pageText, code: false}]
            delegate: ColumnLayout {
                id: section
                required property var modelData
                Layout.fillWidth: true
                RowLayout {
                    visible: !!section.modelData.code
                    Layout.fillWidth: true
                    Ui.Text {
                        text: section.modelData.language || qsTr("Code")
                        role: Ui.Typography.MonoLabel
                        Layout.fillWidth: true
                    }
                    Ui.EditorButton {
                        text: qsTr("Copy code")
                        onClicked: if (paged.chatSession) paged.chatSession.copyText(section.modelData.copy)
                    }
                }
                Ui.TextArea {
                    Layout.fillWidth: true
                    value: section.modelData.text
                    textFormat: !section.modelData.code && paged.markdown && !/!\[|<\/?[A-Za-z]|\$\$|\\[([]/.test(section.modelData.text) ? TextEdit.MarkdownText : TextEdit.PlainText
                    readOnly: true
                    selectByMouse: true
                    wrapMode: TextEdit.Wrap
                    role: section.modelData.code || paged.monospaced ? Ui.Typography.MonoCode : Ui.Typography.SansBody
                    variant: paged.monospaced ? Ui.TextArea.Code : paged.userBubble ? Ui.TextArea.Bubble : section.modelData.code ? Ui.TextArea.Code : Ui.TextArea.Plain
                    accessibleName: section.modelData.text
                    onLinkActivated: link => {
                        if (paged.chatSession) { paged.chatSession.openExternal(link); }
                    }
                }
            }
        }
        Ui.EditorButton {
            visible: paged.copyLabel.length > 0
            text: paged.copyLabel
            onClicked: if (paged.chatSession) paged.chatSession.copyText(paged.sourceText)
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
                text: qsTr("Section %1 of %2").arg(Math.min(paged.page, paged.pages - 1) + 1).arg(paged.pages)
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
            required property int index
            readonly property var part: modelData
            readonly property string kind: part.type || "unknown"
            readonly property bool detailsOpen: !!part.expanded
            Layout.fillWidth: true
            implicitHeight: partContent.implicitHeight + Ui.Metrics.md * 2
            ColumnLayout {
                id: partContent
                anchors.fill: parent
                anchors.margins: Ui.Metrics.md
                spacing: Ui.Metrics.md
                RowLayout {
                    visible: partFrame.kind !== "prose"
                    Layout.fillWidth: true
                    Ui.Text {
                        role: Ui.Typography.SansLabel
                        Layout.fillWidth: true
                        text: partFrame.part.label || partFrame.part.tool_name || partFrame.part.name || partFrame.part.title || partFrame.kind
                        tone: Ui.Text.Secondary
                        elide: Text.ElideRight
                    }
                    Ui.Text {
                        visible: !!partFrame.part.tool
                        text: partFrame.part.displayStatus || ""
                        role: Ui.Typography.SansCaption
                        tone: partFrame.part.displayStatus === "Failed" ? Ui.Text.Error : Ui.Text.Secondary
                    }
                    Ui.Text {
                        visible: !!partFrame.part.duration
                        text: partFrame.part.duration || ""
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                    Ui.EditorButton {
                        visible: !!partFrame.part.tool || partFrame.kind === "thought"
                        objectName: "toolDetails_" + (partFrame.part.tool_call_id || partFrame.index)
                        text: partFrame.detailsOpen ? qsTr("Hide details") : qsTr("Show details")
                        Accessible.expandable: true
                        Accessible.expanded: partFrame.detailsOpen
                        onClicked: root.parts.toggleExpanded(partFrame.index)
                    }
                }
                Ui.Text {
                    visible: !!partFrame.part.preview
                    text: partFrame.part.preview || ""
                    role: Ui.Typography.MonoCaption
                    tone: Ui.Text.Secondary
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                }
                Ui.Text {
                    visible: !!partFrame.part.progress
                    text: partFrame.part.progress || ""
                    role: Ui.Typography.SansCaption
                }
                Repeater {
                    model: partFrame.detailsOpen ? (partFrame.part.calls || []) : []
                    delegate: ColumnLayout {
                        id: groupedCall
                        required property var modelData
                        Layout.fillWidth: true
                        RowLayout {
                            Layout.fillWidth: true
                            Ui.Text {
                                text: groupedCall.modelData.label + " · " + groupedCall.modelData.displayStatus + (groupedCall.modelData.duration ? " · " + groupedCall.modelData.duration : "")
                                role: Ui.Typography.SansLabel
                                Layout.fillWidth: true
                                elide: Text.ElideRight
                            }
                            Ui.EditorButton {
                                objectName: "groupCall_" + groupedCall.modelData.tool_call_id
                                text: groupedCall.modelData.expanded ? qsTr("Hide details") : qsTr("Show details")
                                Accessible.expandable: true
                                Accessible.expanded: !!groupedCall.modelData.expanded
                                onClicked: root.parts.toggleCall(partFrame.index, groupedCall.modelData.tool_call_id)
                            }
                        }
                        PagedText {
                            Layout.fillWidth: true
                            visible: !!groupedCall.modelData.expanded
                            sourceText: groupedCall.modelData.expanded ? groupedCall.modelData.argumentsText : ""
                            monospaced: true
                            chatSession: root.session
                        }
                        PagedText {
                            Layout.fillWidth: true
                            visible: !!groupedCall.modelData.expanded && !!groupedCall.modelData.resultText
                            sourceText: groupedCall.modelData.expanded ? groupedCall.modelData.resultText : ""
                            monospaced: true
                            copyLabel: qsTr("Copy result")
                            chatSession: root.session
                        }
                    }
                }
                Ui.Text {
                    visible: partFrame.detailsOpen && !!partFrame.part.code
                    text: qsTr("Code · %1").arg(partFrame.part.language || "")
                    role: Ui.Typography.SansLabel
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: partFrame.detailsOpen && !!partFrame.part.code
                    sourceText: partFrame.detailsOpen ? (partFrame.part.code || "") : ""
                    monospaced: true
                    copyLabel: qsTr("Copy code")
                    chatSession: root.session
                }
                Ui.Text {
                    visible: partFrame.detailsOpen && !!partFrame.part.argumentsText
                    text: qsTr("Arguments")
                    role: Ui.Typography.SansLabel
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: partFrame.detailsOpen && !!partFrame.part.argumentsText
                    sourceText: partFrame.detailsOpen ? (partFrame.part.argumentsText || "") : ""
                    monospaced: true
                    chatSession: root.session
                }
                Ui.Text {
                    visible: !!partFrame.part.resultText && partFrame.detailsOpen
                    text: qsTr("Result")
                    role: Ui.Typography.SansLabel
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: !!partFrame.part.resultText && partFrame.detailsOpen
                    sourceText: partFrame.detailsOpen ? (partFrame.part.resultText || "") : ""
                    monospaced: true
                    copyLabel: qsTr("Copy result")
                    chatSession: root.session
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: !!partFrame.part.actionId
                    sourceText: (partFrame.part.message || "") + (partFrame.part.args ? "\n" + JSON.stringify(partFrame.part.args, null, 2) : "")
                    chatSession: root.session
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: !partFrame.part.tool && (partFrame.kind !== "thought" || partFrame.detailsOpen) && (partFrame.kind !== "image" || !partFrame.part.mediaUrl)
                    markdown: partFrame.kind === "thought" || partFrame.kind === "prose"
                    sourceText: partFrame.kind === "thought" && !partFrame.detailsOpen ? "" : partFrame.part.text || partFrame.part.content || (typeof partFrame.part.result === "string" ? partFrame.part.result : "") || qsTr("This content is preserved by the server. Open the web app to use this content type.")
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
