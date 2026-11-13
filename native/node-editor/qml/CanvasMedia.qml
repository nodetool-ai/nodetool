import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Dialogs
import QtQuick.Layouts
import NodeTool.NodeEditor.Media 1.0
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property string mediaKind
    required property var locator
    required property string requestKey
    // The tab's MediaResolver, which reads the media and saves the actions.
    required property var resolver
    property var richEntry: ({})
    property string filename: ""
    property var items: []
    property string notice: ""
    property real logicalWidth: 1
    property real logicalHeight: 1
    property real zoom: 1
    property real offsetX: 0
    property real offsetY: 0
    property real mediaOpacity: 1
    // Web PreviewActions: Download, Add to assets and Copy on a Preview card.
    property bool previewActions: false
    readonly property string actionText: root.richEntry.text || ""
    readonly property bool jsonOutput: root.richEntry.renderer === "json" || root.richEntry.renderer === "object"
    property string actionStatus: ""
    clip: true
    function release() {
        if (preview.item) { preview.item.release() }
        preview.active = false
        rich.active = false
    }
    Rectangle {
        x: root.offsetX
        y: root.offsetY
        width: root.logicalWidth
        height: root.logicalHeight
        scale: root.zoom
        transformOrigin: Item.TopLeft
        color: Ui.Theme.surfaceCanvas
        opacity: root.mediaOpacity
        Loader {
            id: preview
            anchors.fill: parent
            active: root.mediaKind !== "rich"
            sourceComponent: Component {
                MediaGallery {
                    objectName: "canvas-media-preview"
                    items: root.items.length > 0 ? root.items : [{kind: root.mediaKind, locator: root.locator, filename: root.filename, itemKey: "0"}]
                    scopeKey: root.requestKey
                    notice: root.notice
                    compact: true
                    previewCard: root.previewActions
                    resolver: root.resolver
                }
            }
        }
        Loader {
            id: rich
            anchors.fill: parent
            active: root.mediaKind === "rich"
            sourceComponent: Component {
                Flickable {
                    id: richScroll
                    objectName: "canvas-rich-scroll"
                    // The canvas keeps the wheel for zoom until the output holds the focus.
                    readonly property bool engaged: outputScope.activeFocus
                    interactive: engaged
                    clip: true
                    contentWidth: width
                    contentHeight: output.implicitHeight + Ui.Metrics.sm * 2
                    boundsBehavior: Flickable.StopAtBounds
                    Basic.ScrollBar.vertical: Ui.ScrollBar {}
                    FocusScope {
                        id: outputScope
                        width: richScroll.width
                        height: output.implicitHeight + Ui.Metrics.sm * 2
                        TapHandler { onTapped: outputScope.forceActiveFocus(Qt.MouseFocusReason) }
                        RichOutput {
                            id: output
                            objectName: "canvas-rich-output"
                            x: Ui.Metrics.sm
                            y: Ui.Metrics.sm
                            width: parent.width - Ui.Metrics.sm * 2
                            modelData: root.richEntry
                            resolver: root.resolver
                        }
                    }
                }
            }
        }
        HoverHandler { id: cardHover }
        RowLayout {
            objectName: "preview-actions"
            visible: root.previewActions && root.mediaKind === "rich" && (cardHover.hovered || root.actionStatus.length > 0)
            anchors.top: parent.top
            anchors.right: parent.right
            anchors.margins: Ui.Metrics.xs
            spacing: Ui.Metrics.xs
            Ui.Text { visible: root.actionStatus.length > 0; text: root.actionStatus; role: Ui.Typography.SansCaption }
            Ui.EditorButton { objectName: "preview-download"; text: "Download"; accessibleName: "Download preview output"; variant: Ui.EditorButton.Outlined; flat: true; enabled: root.actionText.length > 0
                onClicked: { root.actionStatus = ""; downloadDialog.selectedFile = downloadDialog.currentFolder.toString() + "/" + root.actionName(); downloadDialog.open() } }
            Ui.EditorButton { objectName: "preview-add-assets"; text: "Add to assets"; accessibleName: "Add preview output to assets"; variant: Ui.EditorButton.Outlined; flat: true; enabled: root.actionText.length > 0
                onClicked: { root.actionStatus = ""; if (root.resolver) root.resolver.saveTextToAssets(root.requestKey, root.actionText, root.actionName(), root.jsonOutput ? "application/json" : "text/plain") } }
            Ui.EditorButton { objectName: "preview-copy"; text: "Copy"; accessibleName: "Copy preview output"; variant: Ui.EditorButton.Outlined; flat: true; enabled: root.actionText.length > 0
                onClicked: root.actionStatus = clipboard.copyText(root.actionText) ? "Copied!" : "Could not copy the output" }
        }
    }
    function actionName() { return "preview" + (root.jsonOutput ? ".json" : ".txt") }
    MediaClipboard { id: clipboard }
    FileDialog {
        id: downloadDialog
        fileMode: FileDialog.SaveFile
        onAccepted: if (root.resolver) root.resolver.saveText(root.requestKey, root.actionText, selectedFile)
    }
    Connections {
        target: root.resolver
        function onSaved(key) { if (key === root.requestKey) root.actionStatus = "Saved" }
        function onSaveFailed(key, message) { if (key === root.requestKey) root.actionStatus = message }
        function onAssetSaved(key) { if (key === root.requestKey) root.actionStatus = "Added to assets" }
        function onAssetSaveFailed(key, message) { if (key === root.requestKey) root.actionStatus = message }
    }
}
