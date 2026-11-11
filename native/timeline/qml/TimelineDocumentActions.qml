// nt-panel: slot=documentBar id=timelineDocumentActions order=10 title="Timeline actions"
import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Window
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

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
    component ActionButton: ToolButton { activeFocusOnTab: true }
    Row {
        id: buttons
        spacing: Ui.Metrics.micro
        ActionButton {
            objectName: "openTimelineButton"
            label: "Open timeline"
            shortcut: "Ctrl+O"
            iconOnly: true
            iconName: "videocam"
            onClicked: root.showList()
        }
        ActionButton {
            objectName: "newTimelineButton"
            label: "New timeline"
            iconOnly: true
            iconName: "add"
            onClicked: actions.createAndOpen()
        }
    }
    Ui.Popover {
        id: listPopup
        objectName: "timelineListPopup"
        parent: Controls.Overlay.overlay
        x: Ui.Metrics.lg
        y: Ui.Metrics.lg
        width: Math.min(TimelineMetrics.trackHeaderWidth, parent ? parent.width - 2 * Ui.Metrics.lg : 0)
        height: parent ? parent.height - 2 * Ui.Metrics.lg : 0
        modal: true
        dim: false
        focus: true
        enter: null
        exit: null
        closePolicy: Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutside
        onClosed: { if (root.returnFocus) root.returnFocus.forceActiveFocus() }
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
            Ui.Text {
                id: switchError
                objectName: "timelineSwitchError"
                width: parent.width
                height: visible ? implicitHeight : 0
                visible: !!root.error
                text: root.error
                wrapMode: Text.WordWrap
                tone: Ui.Text.Error
                role: Ui.Typography.SansLabel
                Accessible.role: Accessible.AlertMessage
            }
        }
    }
}
