import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
    id: dialog
    objectName: "entityImagePicker"
    property var library: null
    // A new entity needs an image that is not one yet. Changing a picture may reuse any image.
    property bool hideEntities: true
    readonly property var rows: {
        const images = library ? library.images : []
        return images.filter(row => !hideEntities || !row.isEntity)
    }
    readonly property int tileMinimum: 120 * Ui.Theme.uiScale
    signal picked(string id)
    title: "Pick a reference image"
    width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width - Ui.Metrics.xl * 2 : Ui.Metrics.dialogWidth)
    height: Math.min(implicitHeight, parent ? parent.height - Ui.Metrics.xl * 2 : implicitHeight)
    // The dialog adds its padding under the header. Cancel it so the tiles sit Metrics.md below the title.
    spacing: Ui.Metrics.micro - topPadding
    onAboutToShow: if (library) library.loadImages()

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.md
        RowLayout {
            objectName: "entityImagesLoading"
            visible: !!dialog.library && dialog.library.imagesLoading
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignHCenter
            spacing: Ui.Metrics.md
            Ui.BusyIndicator { running: parent.visible; accessibleName: "Loading images" }
            Ui.Text { text: "Loading images"; role: Ui.Typography.SansBody; tone: Ui.Text.Secondary }
        }
        Ui.Banner {
            objectName: "entityImagesError"
            visible: !!dialog.library && !dialog.library.imagesLoading && dialog.library.imagesError !== ""
            Layout.fillWidth: true
            status: Ui.Status.Error
            message: dialog.library ? dialog.library.imagesError : ""
            actionText: "Retry"
            onActionTriggered: dialog.library.loadImages()
        }
        Ui.EmptyState {
            objectName: "entityImagesEmpty"
            visible: !!dialog.library && !dialog.library.imagesLoading && dialog.library.imagesError === "" && dialog.rows.length === 0
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignHCenter
            maxTextWidth: dialog.availableWidth
            title: "No images"
            message: dialog.library && dialog.library.images.length > 0 ? "Every image here is already an entity." : "Generate or upload an image first."
        }
        GridView {
            id: tiles
            objectName: "entityImageGrid"
            readonly property real gap: Ui.Metrics.md
            // The view extends past the content by one gap, so the last tile ends at the content edge
            // and the scrollbar sits in the dialog padding.
            readonly property int columns: Math.max(1, Math.floor(width / (dialog.tileMinimum + gap)))
            readonly property real tileWidth: width / columns - gap
            visible: dialog.rows.length > 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.rightMargin: -gap
            implicitHeight: contentHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            cellWidth: tileWidth + gap
            cellHeight: tileWidth + Ui.Metrics.xs + captionProbe.implicitHeight + gap
            model: dialog.rows
            ScrollBar.vertical: Ui.ScrollBar {}
            Ui.Text { id: captionProbe; visible: false; text: "Ag"; role: Ui.Typography.SansCaption }
            delegate: Item {
                id: tile
                required property var modelData
                required property int index
                objectName: "entityImageTile_" + modelData.id
                readonly property string accessibleName: "Pick " + (modelData.name || "image")
                width: tiles.tileWidth
                height: tiles.cellHeight - tiles.gap
                activeFocusOnTab: true
                Accessible.role: Accessible.Button
                Accessible.name: accessibleName
                Accessible.onPressAction: pick()
                function pick() { dialog.picked(modelData.id) }
                onActiveFocusChanged: if (activeFocus) tiles.positionViewAtIndex(index, GridView.Contain)
                Keys.onSpacePressed: pick()
                // Return acts on release. Focus moves on close, so a press-time pick would
                // let the release click the button that regains focus and reopen the picker.
                Keys.onReturnPressed: event => { event.accepted = true }
                Keys.onEnterPressed: event => { event.accepted = true }
                Keys.onReleased: event => {
                    if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && !event.isAutoRepeat) {
                        event.accepted = true
                        pick()
                    }
                }
                HoverHandler { id: hover }
                Rectangle {
                    id: frame
                    width: parent.width
                    height: width
                    color: Ui.Theme.surfaceInput
                    radius: Ui.Metrics.radiusControl
                    Image {
                        id: preview
                        anchors.fill: parent
                        anchors.margins: Ui.Metrics.micro
                        source: tile.modelData.url || ""
                        asynchronous: true
                        fillMode: Image.PreserveAspectCrop
                        sourceSize: Qt.size(width * 2, height * 2)
                        visible: status === Image.Ready
                    }
                    Ui.Text {
                        anchors.centerIn: parent
                        visible: !preview.visible && (preview.status === Image.Error || preview.source == "")
                        text: "No image"
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                    Rectangle {
                        anchors.fill: parent
                        radius: parent.radius
                        color: hover.hovered ? Ui.Theme.actionHover : "transparent"
                        border.width: tile.activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
                        border.color: tile.activeFocus ? Ui.Theme.borderFocus : hover.hovered ? Ui.Theme.borderControl : Ui.Theme.borderSubtle
                    }
                }
                Ui.Text {
                    anchors.top: frame.bottom
                    anchors.topMargin: Ui.Metrics.xs
                    width: parent.width
                    text: tile.modelData.name || "Untitled"
                    role: Ui.Typography.SansCaption
                    elide: Text.ElideRight
                }
                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    onPressed: tile.forceActiveFocus(Qt.MouseFocusReason)
                    onReleased: if (containsMouse) tile.pick()
                }
            }
        }
        RowLayout {
            Layout.alignment: Qt.AlignRight
            Ui.EditorButton { objectName: "entityImagePickerCancel"; density: Ui.EditorButton.Compact; text: "Cancel"; onClicked: dialog.close() }
        }
    }
}
