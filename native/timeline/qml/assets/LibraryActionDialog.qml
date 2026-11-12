import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
    id: dialog
    property string explanation: ""
    property string fieldLabel: "Name"
    property string initialValue: ""
    property string actionLabel: "Save"
    property bool needsValue: true
    // The field shows but may stay empty (clearing all tags).
    property bool allowEmpty: false
    property bool destructive: false
    signal confirmed(string value)
    width: Math.min(384 * Ui.Theme.uiScale, parent ? parent.width - Ui.Metrics.xl * 2 : 0)
    height: Math.min(implicitHeight, parent ? parent.height - Ui.Metrics.xl * 2 : implicitHeight)
    onOpened: { input.value = initialValue; if (needsValue) input.forceActiveFocus() }
    function submit() {
        if (needsValue && !allowEmpty && input.text.trim() === "") return
        confirmed(input.text.trim())
        close()
    }
    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.md
        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            implicitHeight: body.implicitHeight
            clip: true
            contentWidth: availableWidth
            ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                id: body
                width: parent.width
                spacing: Ui.Metrics.md
                LibraryLabel { Layout.fillWidth: true; text: dialog.explanation }
                LibraryLabel { visible: dialog.needsValue; text: dialog.allowEmpty ? dialog.fieldLabel : dialog.fieldLabel + " (required)" }
                LibraryField {
                    id: input
                    objectName: "libraryActionInput"
                    visible: dialog.needsValue
                    Layout.fillWidth: true
                    accessibleName: dialog.fieldLabel
                    onAccepted: dialog.submit()
                }
                LibraryLabel { visible: dialog.needsValue && !dialog.allowEmpty && input.text.trim() === ""; text: "Enter " + dialog.fieldLabel.toLowerCase() + " to continue." }
            }
        }
        RowLayout {
            Layout.alignment: Qt.AlignRight
            LibraryButton { text: "Cancel"; onClicked: dialog.close() }
            LibraryButton {
                text: dialog.actionLabel
                destructive: dialog.destructive
                enabled: !dialog.needsValue || dialog.allowEmpty || input.text.trim() !== ""
                onClicked: dialog.submit()
            }
        }
    }
}
