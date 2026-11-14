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
    function statusLabel(status) {
        switch (String(status).toLowerCase()) {
        case "running": return qsTr("Running")
        case "completed": case "done": return qsTr("Done")
        case "failed": case "error": return qsTr("Failed")
        case "waiting": case "pending": return qsTr("Waiting")
        case "cancelled": case "canceled": return qsTr("Cancelled")
        default: return status || ""
        }
    }
    readonly property bool userMessage: role === "user"
    spacing: Ui.Metrics.md
    objectName: "message_" + messageId
    Ui.Dialog {
        id: imagePreview
        property string mediaUrl: ""
        width: Math.min(root.width, ChatMetrics.columnWidth, parent ? parent.width - Ui.Metrics.lg : ChatMetrics.columnWidth)
        height: Math.min(parent ? parent.height - Ui.Metrics.lg : Ui.Metrics.comfortable * 12, Ui.Metrics.comfortable * 12)
        title: qsTr("Image preview")
        onClosed: mediaUrl = ""
        contentItem: ColumnLayout {
            Ui.EditorButton { text: qsTr("Close image"); onClicked: imagePreview.close() }
            Image {
                Layout.fillWidth: true
                Layout.fillHeight: true
                source: imagePreview.mediaUrl
                sourceSize.width: 1600
                sourceSize.height: 1600
                asynchronous: true
                cache: false
                fillMode: Image.PreserveAspectFit
            }
        }
    }
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
        // A fence language for monospaced text, which colours it as code.
        property string codeLanguage: ""
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
                Ui.Surface {
                    visible: !!section.modelData.resourceUri
                    Layout.fillWidth: true
                    implicitHeight: resourceRow.implicitHeight + Ui.Metrics.md
                    RowLayout {
                        id: resourceRow
                        anchors.fill: parent
                        anchors.margins: Ui.Metrics.sm
                        Ui.Text {
                            text: (section.modelData.resourceKind || "") + " · " + section.modelData.text
                            Layout.fillWidth: true
                            elide: Text.ElideRight
                        }
                        Ui.EditorButton {
                            visible: !!paged.chatSession && (paged.chatSession.resourceKinds || []).indexOf(section.modelData.resourceKind) >= 0
                            text: qsTr("Open resource")
                            onClicked: paged.chatSession.openResource(section.modelData.resourceUri)
                        }
                    }
                }
                ColumnLayout {
                    id: inlineImage
                    // ChatMarkdown.tsx renders Markdown and HTML images in
                    // the reply. Native loads them through the session.
                    readonly property string source: section.modelData.image || ""
                    readonly property var resolved: source && paged.chatSession ? (paged.chatSession.resolvedMedia[source] || null) : null
                    visible: source.length > 0
                    Layout.fillWidth: true
                    function request() { if (source && paged.chatSession && !resolved) paged.chatSession.resolveImage(source) }
                    Component.onCompleted: request()
                    onResolvedChanged: Qt.callLater(request)
                    Image {
                        id: inlinePicture
                        objectName: "markdownImage"
                        Layout.fillWidth: true
                        Layout.preferredHeight: status === Image.Ready ? Math.min(implicitHeight * width / Math.max(1, implicitWidth), Ui.Metrics.comfortable * 8) : 0
                        visible: status === Image.Ready
                        source: inlineImage.resolved && inlineImage.resolved.url ? inlineImage.resolved.url : ""
                        sourceSize.width: 800
                        sourceSize.height: 800
                        fillMode: Image.PreserveAspectFit
                        horizontalAlignment: Image.AlignLeft
                        asynchronous: true
                        cache: false
                        Accessible.name: section.modelData.text || qsTr("Image")
                    }
                    Ui.Text {
                        visible: inlineImage.visible && (!!section.modelData.text || (!!inlineImage.resolved && !!inlineImage.resolved.error))
                        text: inlineImage.resolved && inlineImage.resolved.error ? (section.modelData.text ? section.modelData.text + " · " : "") + inlineImage.resolved.error : section.modelData.text || ""
                        role: Ui.Typography.SansCaption
                        tone: inlineImage.resolved && inlineImage.resolved.error ? Ui.Text.Error : Ui.Text.Secondary
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                    }
                    Ui.EditorButton {
                        visible: inlineImage.visible && !!inlineImage.resolved && !!inlineImage.resolved.error && (inlineImage.source.startsWith("https:") || inlineImage.source.startsWith("http:"))
                        text: qsTr("Open image link")
                        onClicked: if (paged.chatSession) paged.chatSession.openExternal(inlineImage.source)
                    }
                }
                Ui.TextArea {
                    objectName: "markdownMath"
                    // mathMarkdown.ts renders display equations with KaTeX.
                    // Native shows them as Unicode on their own line.
                    visible: !!section.modelData.math
                    Layout.fillWidth: true
                    value: section.modelData.math ? section.modelData.text : ""
                    textFormat: TextEdit.PlainText
                    readOnly: true
                    selectByMouse: true
                    wrapMode: TextEdit.Wrap
                    horizontalAlignment: TextEdit.AlignHCenter
                    role: Ui.Typography.SansBody
                    variant: Ui.TextArea.Plain
                    accessibleName: section.modelData.source || ""
                }
                Ui.TextArea {
                    visible: !section.modelData.resourceUri && !section.modelData.image && !section.modelData.math
                    Layout.fillWidth: true
                    id: markdownText
                    readonly property color linkColour: Ui.Theme.statusInfo
                    function updateLinkColour() {
                        // Qt.callLater can run after the delegate is released.
                        if (paged && paged.chatSession && textFormat === TextEdit.MarkdownText) {
                            paged.chatSession.styleMarkdownLinks(textDocument, linkColour)
                        }
                    }
                    onLinkColourChanged: Qt.callLater(updateLinkColour)
                    onTextChanged: Qt.callLater(updateLinkColour)
                    Component.onCompleted: updateLinkColour()
                    value: section.modelData.text
                    textFormat: !section.modelData.code && paged.markdown ? TextEdit.MarkdownText : TextEdit.PlainText
                    readOnly: true
                    selectByMouse: true
                    wrapMode: TextEdit.Wrap
                    role: section.modelData.code || paged.monospaced ? Ui.Typography.MonoCode : Ui.Typography.SansBody
                    variant: paged.monospaced ? Ui.TextArea.Code : paged.userBubble ? Ui.TextArea.Bubble : section.modelData.code ? Ui.TextArea.Code : Ui.TextArea.Plain
                    accessibleName: section.modelData.text
                    onLinkActivated: link => {
                        if (!paged.chatSession) { return; }
                        const scheme = String(link).split(":")[0]
                        if ((paged.chatSession.resourceKinds || []).indexOf(scheme) >= 0) { paged.chatSession.openResource(link); }
                        else { paged.chatSession.openExternal(link); }
                    }
                    ChatCodeHighlighter {
                        // CodeBlock.tsx highlights fences with Prism.
                        source: section.modelData.code || paged.codeLanguage ? markdownText.textDocument : null
                        language: section.modelData.code ? (section.modelData.language || "") : paged.codeLanguage
                        dark: Ui.Theme.dark
                    }
                }
            }
        }
        Ui.EditorButton {
            objectName: "copyTextButton"
            visible: paged.copyLabel.length > 0
            text: paged.copyLabel
            onClicked: if (paged.chatSession) paged.chatSession.copyText(paged.sourceText)
        }
        Flow {
            spacing: Ui.Metrics.sm
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
        visible: root.text.length > 0
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
            visible: !part.gridMember && !part.timelineHidden
            Layout.fillWidth: true
            implicitHeight: partContent.implicitHeight + Ui.Metrics.md * 2
            Rectangle {
                // ThoughtSection.tsx sets the reasoning against a rail.
                objectName: "thoughtRail"
                visible: partFrame.kind === "thought" && partBody.visible
                x: partContent.x + Ui.Metrics.xs
                y: partContent.y + partBody.y
                width: Ui.Metrics.micro
                height: partBody.height
                color: Ui.Theme.borderControl
            }
            ColumnLayout {
                id: partContent
                anchors.fill: parent
                anchors.margins: Ui.Metrics.md
                spacing: Ui.Metrics.md
                ColumnLayout {
                    visible: partFrame.kind !== "prose"
                    Layout.fillWidth: true
                    Ui.Text {
                        id: partHeading
                        objectName: partFrame.kind === "thought" ? "thoughtHeading" : ""
                        role: Ui.Typography.SansLabel
                        Layout.fillWidth: true
                        text: partFrame.part.label || partFrame.part.tool_name || partFrame.part.name || partFrame.part.title || partFrame.kind
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                        // ThoughtSection.tsx shimmers the heading while the
                        // model is thinking.
                        readonly property bool shimmering: (partFrame.kind === "thought" || partFrame.kind === "tool_timeline") && !!partFrame.part.running && !Ui.Theme.reducedMotion
                        onShimmeringChanged: if (!shimmering) opacity = 1
                        SequentialAnimation on opacity {
                            running: partHeading.shimmering && partHeading.visible
                            loops: Animation.Infinite
                            NumberAnimation { to: 0.45; duration: Ui.Metrics.motionSpin; easing.type: Easing.InOutSine }
                            NumberAnimation { to: 1; duration: Ui.Metrics.motionSpin; easing.type: Easing.InOutSine }
                        }
                    }
                    Flow {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.sm
                        Ui.Text {
                            visible: !!partFrame.part.tool || !!partFrame.part.tree
                            text: root.statusLabel(partFrame.part.displayStatus)
                            role: Ui.Typography.SansCaption
                            tone: root.statusLabel(partFrame.part.displayStatus) === "Failed" ? Ui.Text.Error : Ui.Text.Secondary
                        }
                        Ui.Text {
                            visible: !!partFrame.part.duration
                            text: partFrame.part.duration || ""
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                        }
                        // ToolCallTimeline.tsx: the footer folds the
                        // message's tool rows and names the step count.
                        Ui.Text {
                            visible: partFrame.kind === "tool_timeline" && !partFrame.detailsOpen
                            text: partFrame.part.steps || ""
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                        }
                        Ui.EditorButton {
                            visible: partFrame.kind === "tool_timeline"
                            objectName: "toolTimelineToggle"
                            text: partFrame.detailsOpen ? qsTr("Hide steps") : qsTr("Show steps")
                            Accessible.expandable: true
                            Accessible.expanded: partFrame.detailsOpen
                            onClicked: root.parts.toggleExpanded(partFrame.index)
                        }
                        Ui.EditorButton {
                            visible: (!!partFrame.part.tool && (!partFrame.part.subAgent || !!partFrame.part.objective || !!partFrame.part.argumentsText || !!partFrame.part.resultText || !!partFrame.part.childModel)) || !!partFrame.part.tree || !!partFrame.part.collapsible || partFrame.kind === "thought"
                            objectName: "toolDetails_" + (partFrame.part.tool_call_id || partFrame.index)
                            text: partFrame.detailsOpen ? qsTr("Hide details") : qsTr("Show details")
                            Accessible.expandable: true
                            Accessible.expanded: partFrame.detailsOpen
                            onClicked: root.parts.toggleExpanded(partFrame.index)
                        }
                    }
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: partFrame.kind === "tool_approval_request" && !!partFrame.part.text
                    sourceText: partFrame.kind === "tool_approval_request" ? (partFrame.part.text || "") : ""
                    chatSession: root.session
                }
                // ToolApprovalCard.tsx folds the code and the arguments
                // separately, both closed.
                Repeater {
                    model: partFrame.part.folds ? [
                        {fold: "code", label: partFrame.part.codeOpen ? qsTr("Hide code") : qsTr("Show code"), open: !!partFrame.part.codeOpen, text: partFrame.part.code || "", language: "javascript"},
                        {fold: "arguments", label: partFrame.part.argumentsOpen ? qsTr("Hide arguments") : qsTr("Show arguments"), open: !!partFrame.part.argumentsOpen, text: partFrame.part.argumentsText || "", language: "json"}
                    ].filter(fold => fold.text.length > 0) : []
                    delegate: ColumnLayout {
                        id: approvalFold
                        required property var modelData
                        Layout.fillWidth: true
                        Ui.EditorButton {
                            objectName: "approvalFold_" + approvalFold.modelData.fold
                            text: approvalFold.modelData.label
                            Accessible.expandable: true
                            Accessible.expanded: approvalFold.modelData.open
                            onClicked: root.parts.toggleFold(partFrame.index, approvalFold.modelData.fold)
                        }
                        PagedText {
                            Layout.fillWidth: true
                            visible: approvalFold.modelData.open
                            sourceText: approvalFold.modelData.open ? approvalFold.modelData.text : ""
                            monospaced: true
                            codeLanguage: approvalFold.modelData.language
                            chatSession: root.session
                        }
                    }
                }
                Ui.Text {
                    visible: (partFrame.part.transcriptCount || 0) > 0
                    text: qsTr("%1 messages").arg(partFrame.part.transcriptCount || 0)
                    role: Ui.Typography.SansCaption
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: partFrame.detailsOpen && !!partFrame.part.objective
                    sourceText: partFrame.detailsOpen ? (partFrame.part.objective || "") : ""
                    chatSession: root.session
                }
                ListView {
                    id: nested
                    objectName: "nested_" + (partFrame.part.childKey || partFrame.part.tool_call_id || "")
                    Layout.fillWidth: true
                    Layout.preferredHeight: visible ? Math.min(contentHeight, Ui.Metrics.comfortable * 8) : 0
                    visible: partFrame.detailsOpen && !!partFrame.part.childModel
                    model: visible ? partFrame.part.childModel : null
                    clip: true
                    reuseItems: true
                    // The default highlight animates its old width when the host shrinks.
                    highlightFollowsCurrentItem: false
                    highlight: Item {
                        objectName: nested.objectName + "_highlight"
                        width: nested.width
                        height: nested.currentItem ? nested.currentItem.height : 0
                        y: nested.currentItem ? nested.currentItem.y : 0
                    }
                    spacing: Ui.Metrics.sm
                    ScrollBar.vertical: Ui.ScrollBar {}
                    delegate: Loader {
                        id: childRow
                        required property string messageId
                        required property string role
                        required property string displayText
                        required property var parts
                        required property string status
                        width: nested.width
                        height: item ? item.implicitHeight : 0
                        Component.onCompleted: setSource("MessageDelegate.qml", {
                            messageId: Qt.binding(() => childRow.messageId),
                            role: Qt.binding(() => childRow.role),
                            text: Qt.binding(() => childRow.displayText),
                            parts: Qt.binding(() => childRow.parts),
                            status: Qt.binding(() => childRow.status),
                            session: root.session
                        })
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
                Ui.Progress {
                    // ExecutionTree.tsx: the plan header's completed-task bar.
                    visible: partFrame.part.progressValue !== undefined
                    Layout.fillWidth: true
                    value: partFrame.part.progressValue || 0
                    accessibleName: qsTr("Completed tasks")
                }
                ColumnLayout {
                    id: batchView
                    // GenerationBatchProgress.tsx, ticking once a second.
                    property double now: Date.now()
                    readonly property var progress: visible && root.session && root.session.batchProgress ? root.session.batchProgress(partFrame.part.batch, now) : null
                    readonly property bool active: !!progress && progress.remainingSeconds !== null && progress.remainingSeconds !== undefined
                    visible: !!partFrame.part.batch
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Timer { interval: 1000; repeat: true; running: batchView.active; onTriggered: batchView.now = Date.now() }
                    Ui.EditorButton {
                        objectName: "batchToggle"
                        variant: Ui.EditorButton.Flat
                        contentAlignment: Qt.AlignLeft
                        Layout.fillWidth: true
                        readonly property var p: batchView.progress || {}
                        text: [qsTr("%1 of %2 done").arg(p.done || 0).arg(p.total || 0)]
                            .concat(p.failed > 0 ? [qsTr("Failed: %1").arg(p.failed)] : [])
                            .concat(batchView.active ? [p.remainingSeconds <= 1 ? qsTr("Finishing") : qsTr("About %1 left").arg(p.remainingSeconds < 60 ? p.remainingSeconds + "s" : Math.floor(p.remainingSeconds / 60) + "m " + (p.remainingSeconds % 60) + "s")] : [])
                            .join(" · ")
                        accessibleName: partFrame.part.batchOpen ? qsTr("Hide requests") : qsTr("Show requests")
                        Accessible.expandable: true
                        Accessible.expanded: !!partFrame.part.batchOpen
                        onClicked: root.parts.toggleFold(partFrame.index, "batch")
                    }
                    Ui.Progress {
                        Layout.fillWidth: true
                        value: batchView.progress ? batchView.progress.percent / 100 : 0
                        accessibleName: qsTr("Generation progress")
                    }
                    Repeater {
                        model: partFrame.part.batchOpen && batchView.progress ? batchView.progress.items : []
                        delegate: ColumnLayout {
                            id: batchItem
                            required property var modelData
                            Layout.fillWidth: true
                            spacing: 0
                            readonly property var statusNames: ({queued: qsTr("Queued"), running: qsTr("Running"), completed: qsTr("Done"), failed: qsTr("Failed")})
                            Ui.Text {
                                Layout.fillWidth: true
                                text: batchItem.modelData.label + " · " + (batchItem.statusNames[batchItem.modelData.status] || batchItem.modelData.status) + " · " + batchItem.modelData.timing
                                role: Ui.Typography.SansLabel
                                tone: batchItem.modelData.status === "failed" ? Ui.Text.Error : Ui.Text.Primary
                                wrapMode: Text.Wrap
                            }
                            Repeater {
                                model: [batchItem.modelData.model, batchItem.modelData.prompt, batchItem.modelData.error].filter(line => !!line)
                                delegate: Ui.Text {
                                    required property string modelData
                                    required property int index
                                    Layout.fillWidth: true
                                    text: modelData
                                    role: Ui.Typography.SansCaption
                                    tone: modelData === batchItem.modelData.error ? Ui.Text.Error : Ui.Text.Secondary
                                    wrapMode: Text.Wrap
                                }
                            }
                        }
                    }
                }
                Repeater {
                    model: partFrame.detailsOpen ? (partFrame.part.calls || []) : []
                    delegate: ColumnLayout {
                        id: groupedCall
                        required property var modelData
                        Layout.fillWidth: true
                        ColumnLayout {
                            Layout.fillWidth: true
                            Ui.Text {
                                text: groupedCall.modelData.label + " · " + root.statusLabel(groupedCall.modelData.displayStatus) + (groupedCall.modelData.duration ? " · " + groupedCall.modelData.duration : "")
                                role: Ui.Typography.SansLabel
                                Layout.fillWidth: true
                                wrapMode: Text.Wrap
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
                    text: partFrame.part.language ? qsTr("Code · %1").arg(partFrame.part.language) : qsTr("Code")
                    role: Ui.Typography.SansLabel
                }
                PagedText {
                    Layout.fillWidth: true
                    objectName: "toolCode_" + (partFrame.part.tool_call_id || partFrame.index)
                    visible: partFrame.detailsOpen && !!partFrame.part.code
                    sourceText: partFrame.detailsOpen ? (partFrame.part.code || "") : ""
                    monospaced: true
                    codeLanguage: partFrame.part.language || "javascript"
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
                // SearchResults.tsx: a numbered list of title, source and
                // snippet in place of the raw result.
                Repeater {
                    model: partFrame.detailsOpen ? (partFrame.part.searchResults || []) : []
                    delegate: RowLayout {
                        id: searchResult
                        required property var modelData
                        required property int index
                        objectName: "searchResult_" + index
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.sm
                        Ui.Text {
                            Layout.alignment: Qt.AlignTop
                            text: String(searchResult.index + 1).padStart(2, "0")
                            role: Ui.Typography.MonoCaption
                            tone: Ui.Text.Disabled
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.xs
                            RowLayout {
                                Layout.fillWidth: true
                                Ui.EditorButton {
                                    visible: !!searchResult.modelData.url
                                    Layout.fillWidth: true
                                    variant: Ui.EditorButton.Flat
                                    contentAlignment: Qt.AlignLeft
                                    text: searchResult.modelData.title
                                    accessibleName: qsTr("Open %1").arg(searchResult.modelData.title)
                                    onClicked: if (root.session) root.session.openExternal(searchResult.modelData.url)
                                }
                                Ui.Text {
                                    visible: !searchResult.modelData.url
                                    Layout.fillWidth: true
                                    text: searchResult.modelData.title
                                    role: Ui.Typography.SansLabel
                                    elide: Text.ElideRight
                                }
                                Ui.Text {
                                    visible: !!searchResult.modelData.source
                                    Layout.maximumWidth: partContent.width * 0.4
                                    text: searchResult.modelData.source || ""
                                    role: Ui.Typography.SansCaption
                                    tone: Ui.Text.Disabled
                                    elide: Text.ElideRight
                                }
                            }
                            Ui.Text {
                                visible: !!searchResult.modelData.snippet
                                Layout.fillWidth: true
                                text: searchResult.modelData.snippet || ""
                                role: Ui.Typography.SansCaption
                                tone: Ui.Text.Secondary
                                wrapMode: Text.Wrap
                            }
                        }
                    }
                }
                PagedText {
                    Layout.fillWidth: true
                    objectName: "toolResult_" + (partFrame.part.tool_call_id || partFrame.index)
                    visible: !!partFrame.part.resultText && partFrame.detailsOpen && !partFrame.part.searchResults
                    sourceText: partFrame.detailsOpen ? (partFrame.part.resultText || "") : ""
                    monospaced: true
                    copyLabel: qsTr("Copy result")
                    chatSession: root.session
                }
                PagedText {
                    Layout.fillWidth: true
                    visible: !!partFrame.part.planText
                    sourceText: partFrame.part.planText || ""
                    chatSession: root.session
                }
                PagedText {
                    id: partBody
                    Layout.fillWidth: true
                    Layout.leftMargin: partFrame.kind === "thought" ? Ui.Metrics.lg : 0
                    visible: !partFrame.part.resourceKind && partFrame.kind !== "tool_approval_request" && !partFrame.part.planText && !partFrame.part.tool && (partFrame.kind !== "compaction" || partFrame.detailsOpen) && (!partFrame.part.tree || (partFrame.detailsOpen && !!partFrame.part.text)) && (partFrame.kind !== "thought" || partFrame.detailsOpen) && (!partFrame.part.media || !partFrame.part.mediaUrl) && !partFrame.part.grid && partFrame.kind !== "tool_timeline"
                    markdown: partFrame.kind === "thought" || partFrame.kind === "prose"
                    sourceText: (partFrame.kind === "thought" || partFrame.kind === "compaction" || partFrame.part.tree) && !partFrame.detailsOpen ? "" : partFrame.part.text || partFrame.part.content || (typeof partFrame.part.result === "string" ? partFrame.part.result : "") || qsTr("This content is preserved by the server. Open the web app to use this content type.")
                    chatSession: root.session
                }
                Flow {
                    objectName: "mediaGrid"
                    visible: !!partFrame.part.grid
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.sm
                    Repeater {
                        model: partFrame.part.grid || []
                        delegate: Item {
                            id: tile
                            required property var modelData
                            readonly property bool ready: String(modelData.mediaUrl || "").indexOf("data:image/") === 0
                            width: ChatMetrics.mediaTile
                            height: ChatMetrics.mediaTile
                            function enlarge() { if (tileImage.status === Image.Ready) { imagePreview.returnFocusTo = tile; imagePreview.mediaUrl = tileImage.source; imagePreview.open() } }
                            activeFocusOnTab: tileImage.status === Image.Ready
                            Accessible.role: Accessible.Button
                            Accessible.name: qsTr("Open large image %1").arg(modelData.label || "")
                            Accessible.onPressAction: enlarge()
                            Keys.onSpacePressed: enlarge()
                            Keys.onReturnPressed: enlarge()
                            Image {
                                id: tileImage
                                objectName: "mediaTileImage"
                                anchors.fill: parent
                                source: tile.ready ? tile.modelData.mediaUrl : ""
                                sourceSize.width: ChatMetrics.mediaTile * 2
                                sourceSize.height: ChatMetrics.mediaTile * 2
                                fillMode: Image.PreserveAspectCrop
                                asynchronous: true
                                cache: false
                                Accessible.name: tile.modelData.label || qsTr("Image result")
                            }
                            Ui.Text {
                                anchors.centerIn: parent
                                width: parent.width - Ui.Metrics.sm * 2
                                visible: tileImage.status !== Image.Ready
                                text: tile.modelData.mediaError || tile.modelData.text || ""
                                role: Ui.Typography.SansCaption
                                tone: tile.modelData.mediaError ? Ui.Text.Error : Ui.Text.Secondary
                                wrapMode: Text.Wrap
                                horizontalAlignment: Text.AlignHCenter
                            }
                            Rectangle {
                                anchors.fill: parent
                                visible: tile.activeFocus
                                color: "transparent"
                                border.width: Ui.Metrics.focus
                                border.color: Ui.Theme.borderFocus
                            }
                            TapHandler {
                                enabled: tileImage.status === Image.Ready
                                onTapped: tile.enlarge()
                            }
                        }
                    }
                }
                Image {
                    id: mediaImage
                    sourceSize.width: 800
                    sourceSize.height: 800
                    Layout.fillWidth: true
                    Layout.preferredHeight: Math.min(implicitHeight, Ui.Metrics.comfortable * 8)
                    visible: !partFrame.part.grid && !!partFrame.part.media && String(partFrame.part.mediaUrl || "").indexOf("data:image/") === 0
                    source: visible ? partFrame.part.mediaUrl : ""
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                    cache: false
                    Accessible.name: partFrame.part.name || qsTr("Image result")
                }
                Ui.Text {
                    visible: mediaImage.status === Image.Error
                    text: qsTr("Image preview unavailable")
                    tone: Ui.Text.Error
                }
                Ui.EditorButton {
                    visible: mediaImage.visible && mediaImage.status === Image.Ready
                    text: qsTr("Open large image")
                    onClicked: { imagePreview.returnFocusTo = this; imagePreview.mediaUrl = mediaImage.source; imagePreview.open() }
                }
                Loader {
                    id: playerLoader
                    // MediaOutputGroup.tsx plays audio and video inline.
                    readonly property bool playable: (partFrame.kind === "audio" || partFrame.kind === "video") && !!root.session && root.session.embeddedMedia
                    readonly property var loaded: playable ? (root.session.resolvedMedia[root.session.mediaKey(partFrame.part.locator || {})] || null) : null
                    Layout.fillWidth: true
                    active: !!loaded && !!loaded.url
                    visible: active
                    onLoaded: item.source = Qt.binding(() => playerLoader.loaded && playerLoader.loaded.url ? playerLoader.loaded.url : "")
                    Component.onCompleted: setSource("ChatMediaPlayer.qml", {source: "", video: partFrame.kind === "video", label: partFrame.part.label || ""})
                }
                Ui.Text {
                    visible: !!playerLoader.loaded && !!playerLoader.loaded.error
                    text: playerLoader.loaded && playerLoader.loaded.error ? playerLoader.loaded.error : ""
                    tone: Ui.Text.Error
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
                Flow {
                    visible: partFrame.kind === "audio" || partFrame.kind === "video"
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.sm
                    Ui.EditorButton {
                        objectName: "loadMediaPlayer"
                        visible: playerLoader.playable && !playerLoader.active
                        iconName: "playArrow"
                        text: playerLoader.loaded && playerLoader.loaded.loading ? qsTr("Loading…") : qsTr("Play here")
                        enabled: !(playerLoader.loaded && playerLoader.loaded.loading)
                        onClicked: root.session.loadMedia(partFrame.part.locator || {})
                    }
                    Ui.EditorButton {
                        text: qsTr("Open media")
                        onClicked: if (root.session) root.session.openMedia(partFrame.part.locator)
                    }
                }
                Ui.EditorButton {
                    visible: !!partFrame.part.resourceKind && !!root.session && (root.session.resourceKinds || []).indexOf(partFrame.part.resourceKind) >= 0
                    text: qsTr("Open resource")
                    onClicked: root.session.openResource(partFrame.part.uri)
                }
                Ui.EditorButton {
                    visible: !!partFrame.part.helpUrl
                    text: qsTr("Where to get this key")
                    onClicked: if (root.session) root.session.openExternal(partFrame.part.helpUrl)
                }
                Ui.Text {
                    visible: !!partFrame.part.status && !partFrame.part.pending
                    text: partFrame.part.status || ""
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                    role: Ui.Typography.SansLabel
                }
                Flow {
                    spacing: Ui.Metrics.sm
                    visible: ["tool_approval_request", "plan_approval_request", "secret_request"].indexOf(partFrame.kind) >= 0 && !!partFrame.part.actionId && !!partFrame.part.pending
                    Layout.fillWidth: true
                    Ui.TextField {
                        id: response
                        objectName: "planFeedback"
                        width: parent.width
                        visible: partFrame.kind === "plan_approval_request"
                        text: partFrame.part.feedback || ""
                        onTextEdited: root.parts.setFeedback(partFrame.index, text)
                        placeholderText: qsTr("What should change?")
                        accessibleName: qsTr("Plan feedback")
                    }
                    Ui.EditorButton {
                        visible: partFrame.kind !== "secret_request"
                        text: partFrame.kind === "plan_approval_request" ? qsTr("Run this plan") : qsTr("Allow")
                        enabled: !!root && !!root.session && root.session.connectionStatus === "connected"
                        onClicked: {
                            root.session.respondToAction(partFrame.part.actionId, true);
                        }
                    }
                    Ui.EditorButton {
                        visible: partFrame.kind === "plan_approval_request"
                        text: qsTr("Revise")
                        enabled: !!response && response.text.trim().length > 0 && !!root && !!root.session && root.session.connectionStatus === "connected"
                        onClicked: root.session.respondToAction(partFrame.part.actionId, false, response.text)
                    }
                    // SecretRequestCard.tsx: the key goes to the secret store
                    // and nowhere else.
                    Ui.TextField {
                        id: secretValue
                        objectName: "secretValue"
                        width: parent.width
                        visible: partFrame.kind === "secret_request"
                        echoMode: TextInput.Password
                        placeholderText: qsTr("Paste your key")
                        accessibleName: qsTr("Value for %1").arg(partFrame.part.key || "")
                        onAccepted: if (text.trim().length > 0) root.session.saveSecret(partFrame.part.actionId, text)
                    }
                    Ui.EditorButton {
                        objectName: "saveSecret"
                        visible: partFrame.kind === "secret_request"
                        variant: Ui.EditorButton.Primary
                        text: qsTr("Save key")
                        enabled: secretValue.text.trim().length > 0 && !!root.session && root.session.connectionStatus === "connected"
                        onClicked: { root.session.saveSecret(partFrame.part.actionId, secretValue.text); secretValue.text = "" }
                    }
                    Ui.EditorButton {
                        objectName: "allowForChat"
                        visible: partFrame.kind === "tool_approval_request"
                        text: qsTr("Allow for this chat")
                        enabled: !!root && !!root.session && root.session.connectionStatus === "connected"
                        onClicked: root.session.allowActionForChat(partFrame.part.actionId)
                    }
                    Ui.EditorButton {
                        visible: partFrame.kind === "secret_request"
                        text: qsTr("Open settings")
                        onClicked: if (root.session) root.session.openProviderSettings()
                    }
                    Ui.EditorButton {
                        text: partFrame.kind === "plan_approval_request" ? qsTr("Don’t run") : partFrame.kind === "tool_approval_request" ? qsTr("Deny") : qsTr("Not now")
                        enabled: !!root && !!root.session && root.session.connectionStatus === "connected"
                        onClicked: {
                            root.session.respondToAction(partFrame.part.actionId, false);
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
