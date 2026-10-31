// nt-panel: slot=right id=assistant order=90 title="Assistant"
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.Chat
import "../assets/AssetContext.js" as Context
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: panel
    objectName: "timelineAssistantPanel"
    color: Ui.Theme.surfaceCanvas
    property var timeline: null
    property var chatSession: typeof nativeChatSession !== "undefined" ? nativeChatSession : null
    property var toolEngine: typeof nativeAssistantTools !== "undefined" ? nativeAssistantTools : null
    readonly property var review: toolEngine ? toolEngine.planningReview : ({})

    Component.onCompleted: Qt.callLater(() => {
        const editor = Context.editorFor(panel)
        panel.timeline = editor ? editor.timeline : null
        if (toolEngine) toolEngine.bindGenerationController(editor)
    })

    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        Loader {
            objectName: "nativeChatPanel"
            Layout.fillWidth: true
            Layout.fillHeight: true
            sourceComponent: ChatPanel { session: panel.chatSession }
        }
        Ui.Text {
            visible: panel.toolEngine && panel.toolEngine.error !== ""
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.lg
            text: panel.toolEngine ? panel.toolEngine.error : ""
            wrapMode: Text.Wrap
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Error
        }
        ColumnLayout {
            visible: panel.review.kind !== undefined
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.lg
            spacing: Ui.Metrics.sm
            Ui.Text {
                text: panel.review.kind === "planCandidate" ? qsTr("Review beat plan") : qsTr("Review production request")
                role: Ui.Typography.SansLabel
            }
            Ui.Text {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                text: (panel.review.requestCount || 0) + qsTr(" requests")
                    + (panel.review.provider ? " · " + panel.review.provider + " / " + panel.review.model : "")
                    + " · " + (panel.review.costKnown && panel.review.estimatedCredits === 0
                               ? qsTr("No generation cost") : qsTr("Cost estimate unavailable"))
            }
            Basic.ScrollView {
                visible: (panel.review.beats || []).length > 0 || (panel.review.requests || []).length > 0
                Layout.fillWidth: true
                Layout.preferredHeight: Ui.Metrics.touch * 3
                contentWidth: availableWidth
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Repeater {
                        model: panel.review.beats || []
                        delegate: Ui.Text {
                            required property var modelData
                            width: parent.width
                            wrapMode: Text.Wrap
                            role: Ui.Typography.SansLabel
                            text: (modelData.durationMs / 1000) + qsTr(" s · ") + modelData.prompt
                        }
                    }
                    Repeater {
                        model: panel.review.requests || []
                        delegate: Ui.Text {
                            required property var modelData
                            width: parent.width
                            wrapMode: Text.Wrap
                            role: Ui.Typography.SansLabel
                            text: modelData.kind + " · " + modelData.provider + " / " + modelData.model
                        }
                    }
                }
            }
            Row {
                spacing: Ui.Metrics.sm
                Ui.EditorButton {
                    visible: panel.review.requiresApproval === true
                    text: panel.review.kind === "planCandidate" ? qsTr("Apply plan") : qsTr("Approve requests")
                    variant: Ui.EditorButton.Primary
                    onClicked: panel.toolEngine.approvePlanning(true)
                }
                Ui.EditorButton { text: qsTr("Cancel planning"); variant: Ui.EditorButton.Flat; onClicked: panel.toolEngine.approvePlanning(false) }
            }
        }
        Ui.EditorButton {
            visible: !!panel.toolEngine
            Layout.margins: Ui.Metrics.lg
            text: qsTr("Recover prepared batch")
            onClicked: panel.toolEngine.recoverPlanning()
        }
    }
}
