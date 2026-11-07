import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "output-comparison"
    required property var comparison
    property string mode: "horizontal"
    property real position: 0.5
    spacing: Ui.Metrics.xs
    RowLayout {
        Layout.fillWidth: true
        Ui.Text { Layout.fillWidth: true; text: root.comparison.label_a || "Image A"; role: Ui.Typography.SansCaption; elide: Text.ElideRight }
        NodeButton {
            objectName: "comparison-mode"
            text: root.mode === "horizontal" ? "Vertical wipe" : "Horizontal wipe"
            variant: NodeButton.Flat
            onClicked: { root.mode = root.mode === "horizontal" ? "vertical" : "horizontal"; root.position = 0.5 }
        }
        Ui.Text { Layout.fillWidth: true; text: root.comparison.label_b || "Image B"; role: Ui.Typography.SansCaption; elide: Text.ElideRight; horizontalAlignment: Text.AlignRight }
    }
    Item {
        id: viewport
        Layout.fillWidth: true
        Layout.preferredHeight: Math.min(width * 3 / 4, Ui.Metrics.comfortable * 5)
        clip: true
        MediaPreview {
            anchors.fill: parent
            mediaKind: "image"
            fillPreview: true
            showFilename: false
            locator: Object.assign({type: "image"}, root.comparison.image_b)
        }
        Item {
            width: root.mode === "horizontal" ? viewport.width * root.position : viewport.width
            height: root.mode === "vertical" ? viewport.height * root.position : viewport.height
            clip: true
            MediaPreview {
                width: viewport.width; height: viewport.height
                mediaKind: "image"
                fillPreview: true
                showFilename: false
                locator: Object.assign({type: "image"}, root.comparison.image_a)
            }
        }
        Rectangle {
            x: root.mode === "horizontal" ? viewport.width * root.position - width / 2 : 0
            y: root.mode === "vertical" ? viewport.height * root.position - height / 2 : 0
            width: root.mode === "horizontal" ? Ui.Metrics.focus : viewport.width
            height: root.mode === "vertical" ? Ui.Metrics.focus : viewport.height
            color: Ui.Theme.textPrimary
        }
        MouseArea {
            objectName: "comparison-drag"
            anchors.fill: parent
            preventStealing: true
            cursorShape: root.mode === "horizontal" ? Qt.SplitHCursor : Qt.SplitVCursor
            function updatePosition(mouse) { root.position = Math.max(0, Math.min(1, root.mode === "horizontal" ? mouse.x / width : mouse.y / height)) }
            onPressed: mouse => updatePosition(mouse)
            onPositionChanged: mouse => { if (pressed) updatePosition(mouse) }
            Accessible.role: Accessible.Slider
            Accessible.name: "Image comparison divider"
        }
    }
}
