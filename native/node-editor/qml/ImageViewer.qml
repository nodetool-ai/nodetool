import QtQuick
import QtQuick.Window
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Window {
    id: root
    objectName: "image-viewer-window"
    title: "Image viewer"
    flags: Qt.Dialog
    modality: Qt.WindowModal
    color: Ui.Theme.surfaceOverlay
    width: Math.min(Screen.desktopAvailableWidth, Ui.Metrics.comfortable * 24)
    height: Math.min(Screen.desktopAvailableHeight, Ui.Metrics.comfortable * 18)
    property var items: []
    property int currentIndex: 0
    property string scopeKey: ""
    property Item returnFocusTo: null
    property var selected: ({})
    readonly property string identity: JSON.stringify([selected.itemKey, selected.locator])
    function openAt(sources, index, trigger) {
        items = sources
        currentIndex = index
        selected = items[index]
        returnFocusTo = trigger
        show()
        requestActivate()
        Qt.callLater(() => { if (root.visible && root.active) content.forceActiveFocus(Qt.PopupFocusReason) })
    }
    function sync(sources) {
        if (!visible) return
        const oldIdentity = identity
        const index = sources.findIndex(item => JSON.stringify([item.itemKey, item.locator]) === oldIdentity)
        if (index < 0) { dismiss(); return }
        // Avoid notifying the selected preview for unrelated appended occurrences.
        if (JSON.stringify(items) !== JSON.stringify(sources)) items = sources
        currentIndex = index
    }
    function step(delta) {
        const next = currentIndex + delta
        if (next >= 0 && next < items.length) { currentIndex = next; selected = items[next]; if (preview.item) preview.item.fitImage() }
    }
    function dismiss() {
        if (preview.item) preview.item.reset()
        hide()
        items = []
        selected = ({})
        currentIndex = 0
        if (returnFocusTo && returnFocusTo.visible && returnFocusTo.enabled)
            returnFocusTo.forceActiveFocus(Qt.PopupFocusReason)
        returnFocusTo = null
    }
    onActiveChanged: if (active) Qt.callLater(() => { if (root.visible && root.active) content.forceActiveFocus(Qt.PopupFocusReason) })
    onClosing: event => { event.accepted = false; dismiss() }
    Connections {
        target: mediaResolver
        function onCleared() { root.dismiss() }
    }
    Ui.Surface {
        id: content
        anchors.fill: parent
        focus: true
        variant: Ui.Surface.Overlay
        Keys.onShortcutOverride: event => event.accepted = true
        Keys.onEscapePressed: root.dismiss()
        Keys.onLeftPressed: root.step(-1)
        Keys.onRightPressed: root.step(1)
        ColumnLayout {
            anchors.fill: parent
            anchors.margins: Ui.Metrics.sm
            spacing: Ui.Metrics.sm
            RowLayout {
                Layout.fillWidth: true
                Ui.Text { text: "Image viewer"; role: Ui.Typography.SansLabel; Layout.fillWidth: true }
                NodeButton { objectName: "image-viewer-close"; text: "Close"; accessibleName: "Close image viewer"; onClicked: root.dismiss() }
            }
            Loader {
                id: preview
                objectName: "image-viewer-preview-loader"
                Layout.fillWidth: true
                Layout.fillHeight: true
                active: root.visible && root.items.length > 0
                sourceComponent: Component {
                    MediaPreview {
                        objectName: "image-viewer-preview"
                        mediaKind: "image"
                        locator: root.selected.locator || ""
                        filename: root.selected.filename || ""
                        requestKey: root.scopeKey + ":modal:" + String(root)
                        fillPreview: true
                        interactiveImage: true
                        showDownload: true
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                NodeButton { objectName: "image-viewer-previous"; text: "Previous"; accessibleName: "Previous image"; enabled: root.currentIndex > 0; onClicked: root.step(-1) }
                Ui.Text { objectName: "image-viewer-position"; Layout.fillWidth: true; horizontalAlignment: Text.AlignHCenter; text: (root.currentIndex + 1) + " / " + root.items.length; role: Ui.Typography.MonoCaption }
                NodeButton { objectName: "image-viewer-next"; text: "Next"; accessibleName: "Next image"; enabled: root.currentIndex + 1 < root.items.length; onClicked: root.step(1) }
            }
        }
    }
}
