// nt-panel: slot=documentBar id=timelineDocumentActions order=10 title="Timeline actions"
import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Window
import NodeTool.Timeline

Item {
    id: root
    objectName: "TimelineDocumentActions"
    required property TimelineModel timeline
    implicitWidth: buttons.implicitWidth
    implicitHeight: buttons.implicitHeight
    readonly property string error: actions.error
    property var returnFocus: null

    TimelineDocumentController {
        id: actions
        anchor: root
        onOpenRequested: root.showList()
        onErrorChanged: { if (error) root.showList(false) }
    }
    function showList(refresh = true) {
        if (!listPopup.opened) returnFocus = root.Window.window ? root.Window.window.activeFocusItem : null
        if (refresh) actions.controller.refresh()
        listPopup.open()
    }
    Shortcut {
        sequence: "Ctrl+O"
        context: Qt.WindowShortcut
        enabled: !listPopup.visible
        onActivated: root.showList()
    }
    component ActionButton: ToolButton {
        activeFocusOnTab: true
        border.width: activeFocus ? Theme.spacingMicro : 0
        border.color: Theme.primary
        Keys.onPressed: event => {
            if (activeFocus && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space)) {
                event.accepted = true
                clicked()
            }
        }
    }
    Row {
        id: buttons
        spacing: Theme.spacingMicro
        ActionButton {
            objectName: "openTimelineButton"
            label: "Open timeline"
            shortcut: "Ctrl+O"
            iconOnly: true
            iconPath: Icons.videocam
            onClicked: root.showList()
        }
        ActionButton {
            objectName: "newTimelineButton"
            label: "New timeline"
            iconOnly: true
            iconPath: Icons.add
            onClicked: actions.createAndOpen()
        }
    }
    Controls.Popup {
        id: listPopup
        objectName: "timelineListPopup"
        parent: Controls.Overlay.overlay
        x: Theme.spacingLg
        y: Theme.spacingLg
        width: Math.min(Theme.trackHeaderWidth, parent ? parent.width - 2 * Theme.spacingLg : 0)
        height: parent ? parent.height - 2 * Theme.spacingLg : 0
        padding: 0
        modal: true
        dim: false
        focus: true
        enter: null
        exit: null
        closePolicy: Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutside
        onClosed: { if (root.returnFocus) root.returnFocus.forceActiveFocus() }
        background: Rectangle { color: Theme.backgroundDefault; border.color: Theme.divider; border.width: Theme.spacingMicro; radius: Theme.radiusMd }
        contentItem: Column {
            Loader {
                width: parent.width
                height: parent.height - switchError.height
                active: listPopup.visible
                sourceComponent: TimelineListPanel {
                    controller: actions.controller
                    autoRefresh: false
                    dismissOnEscape: true
                    onDismissRequested: listPopup.close()
                }
            }
            Text {
                id: switchError
                objectName: "timelineSwitchError"
                width: parent.width
                height: visible ? implicitHeight : 0
                visible: !!root.error
                text: root.error
                wrapMode: Text.WordWrap
                color: Theme.error
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
                Accessible.role: Accessible.AlertMessage
            }
        }
    }
}
