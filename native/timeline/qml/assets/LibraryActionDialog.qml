import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline

Dialog {
    id: dialog
    property string explanation: ""
    property string fieldLabel: "Name"
    property string initialValue: ""
    property string actionLabel: "Save"
    property bool needsValue: true
    property bool destructive: false
    signal confirmed(string value)
    modal: true
    focus: true
    parent: Overlay.overlay
    anchors.centerIn: parent
    width: Math.min(Theme.trackHeaderWidth + Theme.spacingXl * 4, parent ? parent.width - Theme.spacingXl * 2 : Theme.trackHeaderWidth)
    height: Math.min(implicitHeight, parent ? parent.height - Theme.spacingXl * 2 : implicitHeight)
    padding: Theme.spacingXl
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    closePolicy: Popup.CloseOnEscape
    onOpened: { input.text = initialValue; if (needsValue) input.forceActiveFocus() }
    function submit() {
        if (needsValue && input.text.trim() === "") return
        confirmed(input.text.trim())
        close()
    }
    background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusMd }
    contentItem: ScrollView {
        implicitHeight: body.implicitHeight
        clip: true
        contentWidth: availableWidth
        ColumnLayout {
            id: body
            width: parent.width
            spacing: Theme.spacingMd
            LibraryLabel { Layout.fillWidth: true; text: dialog.explanation }
            LibraryLabel { visible: dialog.needsValue; text: dialog.fieldLabel + " (required)" }
            LibraryField {
                id: input
                objectName: "libraryActionInput"
                visible: dialog.needsValue
                Layout.fillWidth: true
                Accessible.name: dialog.fieldLabel
                onAccepted: dialog.submit()
            }
            LibraryLabel { visible: dialog.needsValue && input.text.trim() === ""; text: "Enter " + dialog.fieldLabel.toLowerCase() + " to continue." }
        }
    }
    footer: DialogButtonBox {
        LibraryButton { text: "Cancel"; onClicked: dialog.close() }
        LibraryButton {
            text: dialog.actionLabel
            destructive: dialog.destructive
            enabled: !dialog.needsValue || input.text.trim() !== ""
            onClicked: dialog.submit()
        }
    }
}
