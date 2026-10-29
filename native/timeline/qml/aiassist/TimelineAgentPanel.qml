// nt-panel: slot=right id=assistant order=90 title="Assistant"
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import "../assets/AssetContext.js" as Context
Rectangle {
    id: panel
    objectName: "timelineAssistantPanel"
    color: Theme.backgroundDefault
    property var timeline: null
    ModelCatalogController { id: catalog; mode: "chat" }
    AssistantSession {
        id: session
        objectName: "timelineAssistantSession"
        timeline: panel.timeline
        provider: catalog.selectedProvider
        model: catalog.selectedModelId
    }
    Connections {
        target: panel.timeline
        function onDocumentReplaced() { catalog.reload() }
    }
    Component.onCompleted: Qt.callLater(() => {
        const editor = Context.editorFor(panel)
        panel.timeline = editor ? editor.timeline : null
        session.bindGenerationController(editor)
    })
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Theme.spacingMd
        spacing: Theme.spacingMd
        Text { text: "Editor assistant"; color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmall }
        ComboBox {
            width: parent.width
            model: catalog.models
            textRole: "name"
            displayText: catalog.loading ? "Loading models…" : currentIndex < 0 ? "Choose a model" : currentText
            currentIndex: {
                for (let i = 0; i < catalog.models.length; ++i) {
                    const item = catalog.models[i]
                    if (item.id === catalog.selectedModelId && item.provider === catalog.selectedProvider) return i
                }
                return -1
            }
            onActivated: index => {
                const item = catalog.models[index]
                catalog.selectModel(item.id, item.provider)
            }
        }
        Text { text: catalog.error; width: parent.width; wrapMode: Text.Wrap; color: Theme.textPrimary }
        Button { text: session.ready ? "Connected" : "Connect"; enabled: !session.ready; onClicked: session.connectServer() }
        Flow {
            Layout.fillWidth: true
            spacing: Theme.spacingMd
            Button { text: "New chat"; enabled: !session.busy && !session.loadingHistory; onClicked: { session.newConversation(); conversations.currentIndex = -1 } }
            Button { text: "Previous chats"; enabled: !session.busy && !session.loadingHistory; onClicked: session.listThreads() }
            Button { text: "More chats"; visible: session.hasMoreThreads; enabled: !session.loadingHistory && !session.busy; onClicked: session.listThreads(true) }
        }
        ComboBox {
            id: conversations
            width: parent.width
            visible: session.threads.length > 0
            model: session.threads
            textRole: "title"
            currentIndex: -1
            displayText: currentIndex < 0 ? "Choose a conversation" : currentText
            enabled: !session.busy && !session.loadingHistory
            onActivated: index => session.loadThread(session.threads[index].id)
        }
        Button { text: "Earlier messages"; visible: session.hasOlderMessages; enabled: !session.loadingHistory && !session.busy; onClicked: session.loadOlderMessages() }
        Text { width: parent.width; text: session.error; wrapMode: Text.Wrap; color: Theme.textPrimary }
        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: 0
            TextArea { readOnly: true; text: session.history + (session.answer !== "" ? "Assistant:\n" + session.answer : ""); wrapMode: TextEdit.Wrap }
        }
        Text { visible: session.approval !== ""; text: session.approval; width: parent.width; wrapMode: Text.Wrap; color: Theme.textPrimary }
        Row {
            visible: session.approval !== ""
            Button { text: "Allow"; onClicked: session.approve(true) }
            Button { text: "Deny"; onClicked: session.approve(false) }
        }
        ColumnLayout {
            Layout.fillWidth: true
            visible: session.planningReview.kind !== undefined
            Text { text: session.planningReview.kind === "planCandidate" ? "Review beat plan" : "Review production request"; color: Theme.textPrimary }
            Text {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                color: Theme.textSecondary
                text: (session.planningReview.requestCount || 0) + " requests" + (session.planningReview.provider ? " · " + session.planningReview.provider + " / " + session.planningReview.model : "")
                    + " · " + (session.planningReview.costKnown ? (session.planningReview.estimatedCredits || 0) + " credits" : "Cost estimate unavailable")
            }
            ScrollView {
                Layout.fillWidth: true
                Layout.preferredHeight: Theme.toolbarHeight * 3
                Column {
                    width: parent.width
                    Repeater {
                        model: session.planningReview.beats || []
                        delegate: Text {
                            required property var modelData
                            width: parent.width
                            color: Theme.textPrimary
                            wrapMode: Text.Wrap
                            text: (modelData.durationMs / 1000) + "s · " + modelData.prompt
                        }
                    }
                    Repeater {
                        model: session.planningReview.requests || []
                        delegate: Text {
                            required property var modelData
                            width: parent.width
                            color: Theme.textPrimary
                            wrapMode: Text.Wrap
                            text: modelData.kind + " · " + modelData.provider + " / " + modelData.model
                        }
                    }
                }
            }
            Row {
                Button { visible: session.planningReview.requiresApproval === true; text: session.planningReview.kind === "planCandidate" ? "Apply plan" : "Approve requests"; onClicked: session.approvePlanning(true) }
                Button { text: "Cancel planning"; onClicked: session.approvePlanning(false) }
            }
        }
        Button { text: "Recover prepared batch"; onClicked: session.recoverPlanning() }
        TextArea { id: composer; Layout.fillWidth: true; Layout.preferredHeight: Theme.toolbarHeight * 2; placeholderText: "Ask me to edit the timeline"; wrapMode: TextEdit.Wrap }
        Row {
            Button { text: "Send"; enabled: session.ready && !session.busy && !session.loadingHistory && catalog.selectedModelId !== ""; onClicked: {
                const editor = Context.editorFor(panel)
                const tracks = Context.itemNamed(editor, "tracksRegion")
                session.selectedClipIds = tracks ? tracks.gestures.selection : []
                session.playheadMs = editor ? editor.clock.time : 0
                if (session.send(composer.text)) composer.clear()
            } }
            Button { text: "Stop"; enabled: session.busy; onClicked: session.stop() }
        }
    }
}
