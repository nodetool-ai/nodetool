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
    // Web AssetViewer compare mode: pick the first image, step to a second one, then wipe between them.
    property bool comparing: false
    property var compareA: ({})
    property var compareB: null
    readonly property bool compared: comparing && compareB !== null
    function asImage(item) {
        const locator = item.locator
        return locator && typeof locator === "object" ? locator : { uri: String(locator || "") }
    }
    function startCompare() { compareA = selected; compareB = null; comparing = true }
    function pickCompare() { if (comparing && selected.itemKey !== compareA.itemKey) compareB = selected }
    function exitCompare() { compareB = null }
    function cancelCompare() { comparing = false; compareA = ({}); compareB = null }
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
        if (comparing && !sources.some(item => item.itemKey === compareA.itemKey) || compareB && !sources.some(item => item.itemKey === compareB.itemKey)) cancelCompare()
        // Avoid notifying the selected preview for unrelated appended occurrences.
        if (JSON.stringify(items) !== JSON.stringify(sources)) items = sources
        currentIndex = index
    }
    function step(delta) {
        if (compared) return
        const next = currentIndex + delta
        if (next >= 0 && next < items.length) { currentIndex = next; selected = items[next]; if (preview.item) preview.item.fitImage() }
    }
    function dismiss() {
        cancelCompare()
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
                NodeButton { objectName: "image-viewer-compare"; visible: root.items.length >= 2 && !root.comparing; text: "Compare"; accessibleName: "Compare with another image"; variant: NodeButton.Flat; onClicked: root.startCompare() }
                NodeButton { objectName: "image-viewer-close"; text: "Close"; accessibleName: "Close image viewer"; onClicked: root.dismiss() }
            }
            RowLayout {
                visible: root.comparing && !root.compared
                Layout.fillWidth: true
                spacing: Ui.Metrics.sm
                Ui.Text { Layout.fillWidth: true; text: "Select another image to compare"; role: Ui.Typography.SansCaption; wrapMode: Text.Wrap }
                NodeButton { objectName: "image-viewer-compare-pick"; text: "Compare with this image"; accessibleName: "Compare with this image"; enabled: root.selected.itemKey !== root.compareA.itemKey; onClicked: root.pickCompare() }
                NodeButton { objectName: "image-viewer-compare-cancel"; text: "Cancel"; accessibleName: "Cancel image comparison"; variant: NodeButton.Flat; onClicked: root.cancelCompare() }
            }
            RowLayout {
                visible: root.compared
                Layout.fillWidth: true
                spacing: Ui.Metrics.sm
                Item { Layout.fillWidth: true }
                NodeButton { objectName: "image-viewer-compare-exit"; text: "Exit compare"; accessibleName: "Exit image comparison"; variant: NodeButton.Flat; onClicked: root.exitCompare() }
            }
            Loader {
                id: comparisonView
                objectName: "image-viewer-comparison-loader"
                Layout.fillWidth: true
                Layout.fillHeight: true
                active: root.compared
                visible: active
                sourceComponent: Component {
                    ImageComparisonOutput {
                        comparison: ({
                            image_a: root.asImage(root.compareA), image_b: root.asImage(root.compareB),
                            label_a: root.compareA.filename || "A", label_b: root.compareB.filename || "B"
                        })
                    }
                }
            }
            Loader {
                id: preview
                objectName: "image-viewer-preview-loader"
                Layout.fillWidth: true
                Layout.fillHeight: true
                visible: !root.compared
                active: root.visible && root.items.length > 0 && !root.compared
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
                NodeButton { objectName: "image-viewer-previous"; text: "Previous"; accessibleName: "Previous image"; enabled: !root.compared && root.currentIndex > 0; onClicked: root.step(-1) }
                Ui.Text { objectName: "image-viewer-position"; Layout.fillWidth: true; horizontalAlignment: Text.AlignHCenter; text: (root.currentIndex + 1) + " / " + root.items.length; role: Ui.Typography.MonoCaption }
                NodeButton { objectName: "image-viewer-next"; text: "Next"; accessibleName: "Next image"; enabled: !root.compared && root.currentIndex + 1 < root.items.length; onClicked: root.step(1) }
            }
        }
    }
}
