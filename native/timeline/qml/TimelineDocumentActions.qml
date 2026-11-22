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
    property var documentBar: null

    function findDocumentBar() {
        for (let p = root.parent; p; p = p.parent) {
            if (p.objectName === "documentBar") return p
        }
        return null
    }
    Component.onCompleted: Qt.callLater(() => { root.documentBar = root.findDocumentBar() })
    onParentChanged: root.documentBar = root.findDocumentBar()
    Connections {
        target: root.documentBar
        function onOpenTimelinesRequested() { root.showList() }
    }

    TimelineDocumentController {
        id: actions
        anchor: root
        timeline: root.timeline
        session: typeof nativeSession !== "undefined" ? nativeSession : null
        // main sets nativeAccountServers in the app. Without it the list
        // shows only the timelines on this computer.
        accountServers: typeof nativeAccountServers !== "undefined" ? nativeAccountServers : null
        listShown: listPopup.visible
        onOpenRequested: root.showList()
        onSwitched: listPopup.close()
        onErrorChanged: {
            if (error && musicDialog.opened) musicDialog.error = error
            else if (error) root.showList(false)
        }
    }
    // File > New Music Project (docs/MUSIC-MODE.md section 15) opens this.
    function openNewMusicProject() {
        musicDialog.returnFocusTo = root.Window.window ? root.Window.window.activeFocusItem : null
        musicDialog.open()
        return true
    }
    NewMusicProjectDialog {
        id: musicDialog
        busy: actions.controller.busy
        onCreateRequested: settings => actions.createMusicAndOpen(settings)
    }
    function showList(refresh = true) {
        if (!listPopup.opened) returnFocus = root.Window.window ? root.Window.window.activeFocusItem : null
        if (refresh) actions.prepareList()
        listPopup.open()
    }
    Shortcut {
        sequence: "Ctrl+O"
        context: Qt.WindowShortcut
        enabled: !listPopup.visible && !actions.switching
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
            enabled: !actions.switching
            onClicked: root.showList()
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
        closePolicy: actions.switching
            ? Controls.Popup.NoAutoClose
            : (Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutside)
        onClosed: { if (root.returnFocus) root.returnFocus.forceActiveFocus() }
        contentItem: Column {
            Loader {
                width: parent.width
                height: parent.height
                    - (switchStatus.visible ? switchStatus.implicitHeight : 0)
                    - (switchError.visible ? switchError.implicitHeight : 0)
                    - cloudList.height
                active: listPopup.visible
                enabled: !actions.switching
                sourceComponent: TimelineListPanel {
                    controller: actions.controller
                    activeTimelineId: root.timeline ? root.timeline.timelineId : ""
                    autoRefresh: false
                    dismissOnEscape: true
                    onDismissRequested: if (!actions.switching) listPopup.close()
                }
            }
            // The account's Cloud and Shared with me timelines below the ones
            // on this computer, at most half the list's height.
            Loader {
                id: cloudList
                objectName: "timelineListCloud"
                width: parent.width
                height: item ? Math.min(item.contentHeight, listPopup.height / 2) : 0
                active: listPopup.visible && actions.cloudBrowser !== null
                visible: active
                enabled: !actions.switching
                sourceComponent: Flickable {
                    contentHeight: cloudPanel.implicitHeight
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    CloudDocumentsPanel {
                        id: cloudPanel
                        width: parent.width
                        browser: actions.cloudBrowser
                        onOpenRequested: (kind, documentId, name, role) => actions.cloudBrowser.requestOpen(kind, documentId, name, role)
                    }
                }
            }
            Ui.Text {
                id: switchStatus
                objectName: "timelineSwitchStatus"
                width: parent.width
                visible: actions.switching
                text: "Opening timeline…"
                tone: Ui.Text.Secondary
                role: Ui.Typography.SansLabel
            }
            Ui.Text {
                id: switchError
                objectName: "timelineSwitchError"
                width: parent.width
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
