pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    id: root
    required property var controller
    property string query: ""
    readonly property var choices: controller.spanChoices
    readonly property var matches: choices.filter(choice => (choice.name + " " + choice.status).toLowerCase().includes(query.trim().toLowerCase()))
    readonly property var selected: choices.find(choice => choice.value === controller.focusedSpanId)
    objectName: "trace-log-span-picker"
    text: selected ? selected.name : controller.focusedSpanId ? qsTr("Span %1").arg(controller.focusedSpanId) : qsTr("All spans")
    accessibleName: qsTr("Log span: %1").arg(text)
    menuButton: true
    menuExpanded: popup.visible
    contentAlignment: Qt.AlignLeft
    contentItem: RowLayout {
        spacing: Ui.Metrics.sm
        Ui.Text {
            objectName: "nativeButtonLabel"
            Layout.fillWidth: true
            Layout.minimumWidth: 0
            text: root.text
            textFormat: Text.PlainText
            role: root.textRole
            tone: root.textTone
            elide: Text.ElideRight
            verticalAlignment: Text.AlignVCenter
        }
        Ui.Icon { name: "arrowDropDown"; tone: root.iconTone }
    }
    onClicked: { query = ""; popup.openAt(root); search.forceActiveFocus() }
    function choose(spanId) {
        if (spanId) controller.focusSpan(spanId)
        else controller.clearFocus()
        popup.close()
    }
    Ui.Popover {
        id: popup
        objectName: "trace-log-span-popup"
        width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width : Ui.Metrics.dialogWidth)
        height: Math.min(Ui.Metrics.comfortable * 10, parent ? parent.height : Ui.Metrics.comfortable * 10)
        ColumnLayout {
            anchors.fill: parent
            spacing: Ui.Metrics.sm
            Ui.TextField {
                id: search
                objectName: "trace-log-span-search"
                Layout.fillWidth: true
                accessibleName: qsTr("Search spans by name or status")
                placeholderText: qsTr("Search spans by name or status")
                value: root.query
                onValuePreviewed: value => { root.query = value; results.currentIndex = 0 }
                Keys.onDownPressed: { if (results.count) { results.forceActiveFocus(); results.currentIndex = 0 } }
                Keys.onReturnPressed: if (results.count) root.choose(root.matches[Math.max(0, results.currentIndex)].value)
            }
            Ui.EditorButton {
                objectName: "trace-log-all-spans"
                Layout.fillWidth: true
                text: qsTr("All spans")
                active: !root.controller.focusedSpanId
                onClicked: root.choose("")
            }
            Ui.Text {
                Layout.fillWidth: true
                visible: !!root.controller.focusedSpanId && !root.selected
                text: qsTr("Selected span: %1").arg(root.controller.focusedSpanId)
                textFormat: Text.PlainText
                wrapMode: Text.WrapAnywhere
                tone: Ui.Text.Secondary
            }
            Ui.Text { visible: !results.count; text: qsTr("No matching spans"); tone: Ui.Text.Secondary }
            ListView {
                id: results
                objectName: "trace-log-span-results"
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: root.matches
                activeFocusOnTab: true
                keyNavigationEnabled: true
                Basic.ScrollBar.vertical: Ui.ScrollBar {}
                Keys.onReturnPressed: if (currentIndex >= 0 && currentIndex < count) root.choose(root.matches[currentIndex].value)
                Keys.onEnterPressed: if (currentIndex >= 0 && currentIndex < count) root.choose(root.matches[currentIndex].value)
                Keys.onPressed: event => {
                    if (count && (event.key === Qt.Key_Home || event.key === Qt.Key_End)) {
                        currentIndex = event.key === Qt.Key_Home ? 0 : count - 1
                        positionViewAtIndex(currentIndex, ListView.Contain)
                        event.accepted = true
                    }
                }
                delegate: Ui.EditorButton {
                    id: choice
                    required property var modelData
                    required property int index
                    objectName: "trace-log-span-choice-" + modelData.value
                    width: results.width
                    height: Ui.Metrics.comfortable * 2
                    variant: Ui.EditorButton.Flat
                    active: root.controller.focusedSpanId === modelData.value || (results.activeFocus && results.currentIndex === index)
                    accessibleName: modelData.name + ", " + modelData.status + ", " + modelData.timing
                    onClicked: root.choose(modelData.value)
                    contentItem: ColumnLayout {
                        spacing: Ui.Metrics.xs
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.sm
                            Ui.Text {
                                Layout.fillWidth: true
                                Layout.leftMargin: Math.min(8, Math.max(0, choice.modelData.depth)) * Ui.Metrics.md
                                text: choice.modelData.name
                                textFormat: Text.PlainText
                                role: Ui.Typography.SansLabel
                                tone: choice.modelData.status === "ERROR" ? Ui.Text.Error : Ui.Text.Primary
                                elide: Text.ElideRight
                            }
                            Ui.Status { visible: choice.modelData.status === "ERROR"; status: Ui.Status.Error; message: qsTr("Error") }
                        }
                        Ui.Text { Layout.fillWidth: true; text: choice.modelData.timing; role: Ui.Typography.MonoCaption; tone: Ui.Text.Secondary; elide: Text.ElideRight }
                    }
                }
            }
        }
    }
}
