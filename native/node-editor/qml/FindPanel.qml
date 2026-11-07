import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// Find nodes, as the web FindInWorkflowDialog: a search field, previous and next
// buttons, a result count and a result list. Arrow keys step through the results
// and move the canvas to each. Enter goes to the selected result and closes.
Rectangle {
    id: root
    required property var controller
    readonly property real panelWidth: Ui.Metrics.xxxl * 9.375
    readonly property real maximumHeight: Ui.Metrics.xxxl * 12.5
    readonly property bool hasResults: controller.results.length > 0
    function activate() {
        search.forceActiveFocus(Qt.PopupFocusReason)
    }
    function formatType(type) {
        const parts = type.split(".")
        return parts.length > 1 ? parts.slice(0, -1).join(".") : type
    }
    width: panelWidth
    height: Math.min(maximumHeight, content.implicitHeight + Ui.Metrics.border * 2)
    color: Ui.Theme.surfaceOverlay
    radius: Ui.Metrics.radiusOverlay
    border.width: Ui.Metrics.border
    border.color: Ui.Theme.borderControl
    clip: true

    ColumnLayout {
        id: content
        anchors.fill: parent
        anchors.margins: Ui.Metrics.border
        spacing: 0
        RowLayout {
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.md
            spacing: Ui.Metrics.xs
            Ui.TextField {
                id: search
                objectName: "find-search"
                Layout.fillWidth: true
                placeholderText: qsTr("Find nodes")
                accessibleName: placeholderText
                density: Ui.EditorButton.Compact
                onValuePreviewed: value => root.controller.setTerm(value)
                Keys.priority: Keys.BeforeItem
                Keys.onPressed: event => {
                    if (event.key === Qt.Key_Escape) {
                        root.controller.close()
                        event.accepted = true
                    } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                        if (event.modifiers & Qt.ShiftModifier) {
                            root.controller.previous()
                        } else {
                            root.controller.accept()
                        }
                        event.accepted = true
                    } else if (event.key === Qt.Key_Down) {
                        root.controller.next()
                        event.accepted = true
                    } else if (event.key === Qt.Key_Up) {
                        root.controller.previous()
                        event.accepted = true
                    } else if (event.key === Qt.Key_F && (event.modifiers & Qt.ControlModifier)) {
                        event.accepted = true
                    }
                }
            }
            Ui.ToolbarIconButton {
                objectName: "find-previous"
                iconName: "arrowUpward"
                accessibleName: qsTr("Previous match")
                shortcutText: qsTr("Shift+Enter")
                enabled: root.hasResults
                onClicked: root.controller.previous()
            }
            Ui.ToolbarIconButton {
                objectName: "find-next"
                iconName: "arrowDownward"
                accessibleName: qsTr("Next match")
                shortcutText: qsTr("Enter")
                enabled: root.hasResults
                onClicked: root.controller.next()
            }
            Ui.CloseButton {
                objectName: "find-close"
                accessibleName: qsTr("Close")
                shortcutText: qsTr("Esc")
                onClicked: root.controller.close()
            }
        }
        Ui.Separator {
            Layout.fillWidth: true
        }
        Ui.Text {
            objectName: "find-status"
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.md
            text: root.controller.status
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        Ui.Separator {
            Layout.fillWidth: true
        }
        ListView {
            id: list
            objectName: "find-results"
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: contentHeight
            visible: root.hasResults
            clip: true
            model: root.controller.results
            currentIndex: root.controller.selectedIndex
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            onCurrentIndexChanged: positionViewAtIndex(currentIndex, ListView.Contain)
            delegate: Ui.ListRow {
                id: row
                required property var modelData
                required property int index
                objectName: "find-result-" + index
                width: ListView.view.width
                active: index === root.controller.selectedIndex
                accessibleName: modelData.title
                onClicked: root.controller.choose(index)
                Column {
                    width: row.width - Ui.Metrics.lg
                    Row {
                        spacing: Ui.Metrics.md
                        width: parent.width
                        Ui.Text {
                            id: name
                            text: row.modelData.title
                            role: Ui.Typography.SansLabel
                            elide: Text.ElideRight
                            width: Math.min(implicitWidth, parent.width - type.width - parent.spacing)
                        }
                        Ui.Text {
                            id: type
                            text: root.formatType(row.modelData.type)
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                            elide: Text.ElideRight
                            width: Math.min(implicitWidth, Ui.Metrics.xxxl * 3)
                        }
                    }
                    Ui.Text {
                        visible: row.modelData.field !== ""
                        width: parent.width
                        text: row.modelData.field + ": " + row.modelData.snippet
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        elide: Text.ElideRight
                    }
                }
            }
        }
        Ui.EmptyState {
            Layout.alignment: Qt.AlignHCenter
            Layout.margins: Ui.Metrics.lg
            visible: !root.hasResults && root.controller.term !== ""
            title: qsTr("No matching nodes")
        }
    }
}
