// nt-panel: slot=right id=assistant order=90 title="Assistant"
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.Chat
import "../assets/AssetContext.js" as Context

Rectangle {
    id: panel
    objectName: "timelineAssistantPanel"
    color: Theme.backgroundDefault
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
        Text {
            visible: panel.toolEngine && panel.toolEngine.error !== ""
            Layout.fillWidth: true
            Layout.margins: Theme.spacingLg
            text: panel.toolEngine ? panel.toolEngine.error : ""
            color: Theme.error
            wrapMode: Text.Wrap
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
        }
        ColumnLayout {
            visible: panel.review.kind !== undefined
            Layout.fillWidth: true
            Layout.margins: Theme.spacingLg
            spacing: Theme.spacingSm
            Text {
                text: panel.review.kind === "planCandidate" ? qsTr("Review beat plan") : qsTr("Review production request")
                color: Theme.textPrimary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
            }
            Text {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                color: Theme.textSecondary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmaller
                text: (panel.review.requestCount || 0) + qsTr(" requests")
                    + (panel.review.provider ? " · " + panel.review.provider + " / " + panel.review.model : "")
                    + " · " + (panel.review.costKnown && panel.review.estimatedCredits === 0
                               ? qsTr("No generation cost") : qsTr("Cost estimate unavailable"))
            }
            Basic.ScrollView {
                visible: (panel.review.beats || []).length > 0 || (panel.review.requests || []).length > 0
                Layout.fillWidth: true
                Layout.preferredHeight: Theme.toolbarHeight * 3
                contentWidth: availableWidth
                Column {
                    width: parent.width
                    spacing: Theme.spacingXs
                    Repeater {
                        model: panel.review.beats || []
                        delegate: Text {
                            required property var modelData
                            width: parent.width
                            color: Theme.textPrimary
                            wrapMode: Text.Wrap
                            font.family: Theme.sansFamily
                            font.pixelSize: Theme.fontSizeSmall
                            text: (modelData.durationMs / 1000) + qsTr(" s · ") + modelData.prompt
                        }
                    }
                    Repeater {
                        model: panel.review.requests || []
                        delegate: Text {
                            required property var modelData
                            width: parent.width
                            color: Theme.textPrimary
                            wrapMode: Text.Wrap
                            font.family: Theme.sansFamily
                            font.pixelSize: Theme.fontSizeSmall
                            text: modelData.kind + " · " + modelData.provider + " / " + modelData.model
                        }
                    }
                }
            }
            Row {
                spacing: Theme.spacingSm
                PanelButton {
                    visible: panel.review.requiresApproval === true
                    text: panel.review.kind === "planCandidate" ? qsTr("Apply plan") : qsTr("Approve requests")
                    onClicked: panel.toolEngine.approvePlanning(true)
                }
                PanelButton { text: qsTr("Cancel planning"); onClicked: panel.toolEngine.approvePlanning(false) }
            }
        }
        PanelButton {
            visible: !!panel.toolEngine
            Layout.margins: Theme.spacingLg
            text: qsTr("Recover prepared batch")
            onClicked: panel.toolEngine.recoverPlanning()
        }
    }
}
