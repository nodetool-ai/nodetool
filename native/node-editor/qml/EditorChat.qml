import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.Chat

Ui.Surface {
    id: root
    required property var session
    required property ChatWindow frame
    signal closeRequested()
    variant: Ui.Surface.Panel
    color: Ui.Theme.dark ? Ui.Theme.surfaceCanvas : Ui.Theme.surfacePanel
    clip: true
    property bool threadsOpen: false
    property string query: ""
    property string pendingDelete: ""
    property string pendingLabel: ""
    // The row animating out after a confirmed delete, as ThreadList.tsx deletingId.
    property string deletingId: ""
    Timer {
        id: deleteTimer
        objectName: "editorThreadDeleteTimer"
        // ThreadList.tsx waits MOTION.normal before deleting, with or without motion.
        interval: Ui.Metrics.motionNormal
        onTriggered: {
            const id = root.deletingId
            root.deletingId = ""
            root.session.deleteThread(id)
        }
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.border
        spacing: Ui.Metrics.none
        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.touch
            MouseArea {
                id: drag
                objectName: "chatDragHandle"
                anchors.fill: parent
                property point start
                onDoubleClicked: root.frame.resetPosition()
                onCanceled: root.frame.changeGeometry(0, 0, 0, true)
                onPressed: mouse => {
                    start = mapToGlobal(mouse.x, mouse.y);
                    root.frame.beginGeometry();
                }
                onPositionChanged: mouse => {
                    if (pressed) {
                        const point = mapToGlobal(mouse.x, mouse.y);
                        root.frame.changeGeometry(point.x - start.x, point.y - start.y, 0, false);
                    }
                }
                onReleased: mouse => {
                    const point = mapToGlobal(mouse.x, mouse.y);
                    root.frame.changeGeometry(point.x - start.x, point.y - start.y, 0, true);
                }
            }
            RowLayout {
                anchors.fill: parent
                anchors.margins: Ui.Metrics.sm
                spacing: Ui.Metrics.xs
                Ui.Icon {
                    name: "autoAwesome"
                    domainColor: Ui.Theme.accentPrimary
                }
                Ui.Text {
                    Layout.fillWidth: true
                    role: Ui.Typography.SansLabel
                    text: root.session.threadTitle || qsTr("Chat")
                    elide: Text.ElideRight
                }
                Ui.ToolbarIconButton {
                    objectName: "showEditorThreads"
                    text: qsTr("Show threads")
                    iconName: "history"
                    active: root.threadsOpen
                    onClicked: root.threadsOpen = !root.threadsOpen
                }
                Ui.ToolbarIconButton {
                    objectName: "newEditorConversation"
                    text: qsTr("New conversation")
                    iconName: "editNote"
                    enabled: root.session.connectionStatus === "connected"
                    onClicked: {
                        root.session.createThread();
                        root.threadsOpen = false;
                    }
                }
                Ui.ToolbarIconButton {
                    objectName: "closeEditorChat"
                    text: qsTr("Close chat")
                    iconName: "close"
                    onClicked: root.closeRequested()
                }
            }
        }
        Ui.Separator { Layout.fillWidth: true }
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true
            ChatPanel {
                id: chatPanel
                anchors.fill: parent
                session: root.session
                embedded: true
            }
            Ui.Surface {
                anchors.fill: parent
                anchors.bottomMargin: chatPanel.composerHeight
                visible: root.threadsOpen
                variant: Ui.Surface.Canvas
                color: root.color
                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: Ui.Metrics.md
                    RowLayout {
                        Layout.fillWidth: true
                        Ui.TextField {
                            objectName: "editorThreadSearch"
                            Layout.fillWidth: true
                            placeholderText: qsTr("Search threads")
                            accessibleName: placeholderText
                            onTextEdited: root.query = text.trim().toLowerCase()
                        }
                        Ui.ToolbarIconButton {
                            text: qsTr("Close threads")
                            iconName: "close"
                            onClicked: root.threadsOpen = false
                        }
                    }
                    Ui.Text {
                        Layout.fillWidth: true
                        role: Ui.Typography.SansLabel
                        tone: Ui.Text.Error
                        text: root.session.error
                        visible: text.length > 0
                        wrapMode: Text.WordWrap
                    }
                    ListView {
                        objectName: "editorThreadList"
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true
                        // workflowThreadRows filters by the search and adds the
                        // relative-date headings of ThreadList.tsx.
                        model: root.session.workflowThreads.length >= 0 ? root.session.workflowThreadRows(root.query) : []
                        delegate: Column {
                            id: row
                            required property var modelData
                            readonly property bool deleting: root.deletingId === modelData.id
                            readonly property int motion: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionNormal
                            width: ListView.view.width
                            RowLayout {
                                objectName: "editorThreadGroup-" + (row.modelData.header || "")
                                width: row.width
                                visible: !!row.modelData.header
                                Ui.Text {
                                    Layout.fillWidth: true
                                    Layout.leftMargin: Ui.Metrics.md
                                    Layout.topMargin: Ui.Metrics.md
                                    role: Ui.Typography.SansCaption
                                    tone: Ui.Text.Secondary
                                    text: (row.modelData.header || "").toUpperCase()
                                }
                                Ui.Text {
                                    Layout.rightMargin: Ui.Metrics.md
                                    Layout.topMargin: Ui.Metrics.md
                                    role: Ui.Typography.SansCaption
                                    tone: Ui.Text.Disabled
                                    text: row.modelData.headerDate || ""
                                }
                            }
                            Item {
                                id: rowFrame
                                objectName: "editorThreadRow-" + row.modelData.id
                                width: row.width
                                height: row.deleting ? 0 : rowContent.implicitHeight
                                opacity: row.deleting ? 0 : 1
                                clip: true
                                Behavior on height {
                                    NumberAnimation {
                                        duration: row.motion
                                    }
                                }
                                Behavior on opacity {
                                    NumberAnimation {
                                        duration: row.motion
                                    }
                                }
                                RowLayout {
                                    id: rowContent
                                    width: row.width
                                    x: row.deleting ? -row.width : 0
                                    Behavior on x {
                                        NumberAnimation {
                                            duration: row.motion
                                        }
                                    }
                                    Ui.EditorButton {
                                        Layout.fillWidth: true
                                        text: row.modelData.title || row.modelData.preview
                                        variant: Ui.EditorButton.Flat
                                        contentAlignment: Qt.AlignLeft
                                        active: root.session.selectedThreadId === row.modelData.id
                                        onClicked: {
                                            root.session.selectThread(row.modelData.id);
                                            root.threadsOpen = false;
                                        }
                                    }
                                    Ui.Text {
                                        role: Ui.Typography.SansCaption
                                        tone: Ui.Text.Secondary
                                        text: row.modelData.time || ""
                                    }
                                    Ui.ToolbarIconButton {
                                        objectName: "deleteThread" + row.modelData.id
                                        text: qsTr("Delete conversation")
                                        iconName: "deleteOutline"
                                        enabled: !row.deleting
                                        onClicked: {
                                            root.pendingDelete = row.modelData.id;
                                            root.pendingLabel = row.modelData.title || row.modelData.preview;
                                            deleteDialog.returnFocusTo = this;
                                            deleteDialog.open();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ui.Dialog {
        id: deleteDialog
        title: qsTr("Delete conversation")
        width: root.width - Ui.Metrics.xl * 2
        ColumnLayout {
            width: parent.width
            Ui.Text {
                Layout.fillWidth: true
                role: Ui.Typography.SansLabel
                text: qsTr('Delete "') + root.pendingLabel + qsTr('"? This cannot be undone.')
                wrapMode: Text.WordWrap
            }
            RowLayout {
                Ui.EditorButton {
                    text: qsTr("Cancel")
                    onClicked: deleteDialog.close()
                }
                Ui.EditorButton {
                    objectName: "confirmDeleteEditorThread"
                    text: qsTr("Delete")
                    variant: Ui.EditorButton.Destructive
                    onClicked: {
                        root.deletingId = root.pendingDelete;
                        deleteTimer.restart();
                        deleteDialog.close();
                    }
                }
            }
        }
    }
    Repeater {
        model: [1, 2, 3]
        delegate: MouseArea {
            required property int modelData
            objectName: "chatResize" + modelData
            x: modelData === 2 ? Ui.Metrics.lg : 0
            y: modelData === 1 ? Ui.Metrics.lg : root.height - height
            width: modelData === 2 ? root.width - Ui.Metrics.lg : Ui.Metrics.md
            height: modelData === 1 ? root.height - Ui.Metrics.lg * 2 : Ui.Metrics.md
            cursorShape: modelData === 1 ? Qt.SizeHorCursor : modelData === 2 ? Qt.SizeVerCursor : Qt.SizeBDiagCursor
            property point start
            onCanceled: root.frame.changeGeometry(0, 0, modelData, true)
            onPressed: mouse => {
                start = mapToGlobal(mouse.x, mouse.y);
                root.frame.beginGeometry();
            }
            onPositionChanged: mouse => {
                if (pressed) {
                    const point = mapToGlobal(mouse.x, mouse.y);
                    root.frame.changeGeometry(point.x - start.x, point.y - start.y, modelData, false);
                }
            }
            onReleased: mouse => {
                const point = mapToGlobal(mouse.x, mouse.y);
                root.frame.changeGeometry(point.x - start.x, point.y - start.y, modelData, true);
            }
        }
    }
}
