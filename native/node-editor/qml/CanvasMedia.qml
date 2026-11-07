import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property string mediaKind
    required property var locator
    required property string requestKey
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
                }
            }
        }
        Loader {
            id: rich
            anchors.fill: parent
            active: root.mediaKind === "rich"
            sourceComponent: Component {
                Flickable {
                    objectName: "canvas-rich-scroll"
                    clip: true
                    contentWidth: width
                    contentHeight: output.implicitHeight + Ui.Metrics.sm * 2
                    boundsBehavior: Flickable.StopAtBounds
                    Basic.ScrollBar.vertical: Ui.ScrollBar {}
                    RichOutput {
                        id: output
                        objectName: "canvas-rich-output"
                        x: Ui.Metrics.sm
                        y: Ui.Metrics.sm
                        width: parent.width - Ui.Metrics.sm * 2
                        modelData: root.richEntry
                    }
                }
            }
        }
    }
}
