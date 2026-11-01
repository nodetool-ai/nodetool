// nt-panel: slot=left id=entities order=37 title="Entities"
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: panel
    variant: Ui.Surface.Canvas
    objectName: "timelineEntitiesPanel"
    property alias library: store
    property string selectedId: ""
    // The saved entity to scroll into view once the reloaded list contains it.
    property string revealId: ""
    // The id of the card that last held keyboard focus.
    property string focusedId: ""
    // The card that held focus when a reload destroyed it. The view then focuses another card by itself.
    property string restoreId: ""
    // True while the picker changes the image of the entity in the open editor.
    property bool changingImage: false
    readonly property bool configured: store.configured
    readonly property bool failed: configured && !store.loading && store.error !== ""
    readonly property bool listEmpty: store.entities.length === 0
    clip: true
    // A plain focus target for after a removal, so no neighbouring card looks selected.
    activeFocusOnTab: false

    EntityLibrary { id: store }

    function cardOf(item) {
        for (let ancestor = item; ancestor; ancestor = ancestor.parent) {
            if (ancestor.objectName.startsWith("entityCard_")) return ancestor
        }
        return null
    }
    function reveal() {
        if (revealId === "") return
        const rows = store.entities
        for (let index = 0; index < rows.length; ++index) {
            if (rows[index].id !== revealId) continue
            grid.positionViewAtIndex(index, GridView.Contain)
            revealId = ""
            return
        }
    }
    function restoreFocus() {
        const id = restoreId
        restoreId = ""
        if (id === "") return
        const rows = store.entities
        for (let index = 0; index < rows.length; ++index) {
            if (rows[index].id !== id) continue
            grid.positionViewAtIndex(index, GridView.Contain)
            // The delegate may not exist until the view lays out at its new position.
            grid.forceLayout()
            const target = cardOf(grid.itemAtIndex(index))
            if (target) target.forceActiveFocus()
            return
        }
    }
    function focusedItem() { return panel.Window.window ? panel.Window.window.activeFocusItem : null }
    function startCreate() {
        changingImage = false
        picker.hideEntities = true
        picker.returnFocusTo = focusedItem()
        picker.open()
    }
    function startChangeImage() {
        changingImage = true
        // A new entity needs an image that is not one yet. Only an edit may reuse any image.
        picker.hideEntities = !editor.editing
        picker.returnFocusTo = editor.changeButton
        picker.open()
    }
    function edit(row) {
        editor.returnFocusTo = focusedItem()
        editor.openEdit(row)
    }
    function removeEntity(row) {
        if (selectedId === row.id) selectedId = ""
        store.remove(row.id)
    }
    // The panel loads when first shown and refreshes whenever it is shown again.
    onVisibleChanged: if (visible) store.reload()
    Component.onCompleted: if (visible) store.ensureLoaded()

    Connections {
        target: panel.Window.window
        function onActiveFocusItemChanged() {
            const item = panel.Window.window.activeFocusItem
            const card = panel.cardOf(item)
            if (card) panel.focusedId = card.entityId
            // A destroyed card hands focus to the grid, then the window, which is not a choice to move away.
            else if (item === grid) { if (panel.restoreId === "") panel.restoreId = panel.focusedId }
            else if (item && item !== panel.Window.window.contentItem) { panel.focusedId = ""; panel.restoreId = "" }
        }
    }
    Connections {
        target: store
        function onEntitiesChanged() {
            Qt.callLater(() => { panel.reveal(); panel.restoreFocus() })
        }
        function onSaved(entity) {
            panel.selectedId = entity.id || ""
            panel.revealId = panel.selectedId
            panel.reveal()
        }
        function onRemoved() {
            panel.focusedId = ""
            panel.restoreId = ""
            panel.forceActiveFocus()
        }
    }

    EntityCard { id: probe; visible: false; width: grid.cardWidth }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm
        RowLayout {
            Layout.fillWidth: true
            Ui.Text {
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignVCenter
                text: "Entities"
                role: Ui.Typography.SansLabel
                elide: Text.ElideRight
            }
            LibraryButton {
                objectName: "entityRefreshButton"
                iconName: "refresh"
                accessibleName: "Refresh"
                enabled: panel.configured && !store.loading
                onClicked: store.reload()
            }
            LibraryButton {
                objectName: "entityNewButton"
                iconName: "add"
                accessibleName: "New entity"
                enabled: panel.configured
                onClicked: panel.startCreate()
            }
        }
        Ui.Text {
            objectName: "entityNotConfigured"
            visible: !panel.configured
            Layout.fillWidth: true
            text: "Open a server timeline to use entities."
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
        RowLayout {
            objectName: "entityLoading"
            visible: panel.configured && store.loading && panel.listEmpty
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignHCenter
            spacing: Ui.Metrics.md
            Ui.BusyIndicator { running: parent.visible; accessibleName: "Loading entities" }
            Ui.Text { text: "Loading entities"; role: Ui.Typography.SansBody; tone: Ui.Text.Secondary }
        }
        Ui.Banner {
            objectName: "entityError"
            visible: panel.failed
            Layout.fillWidth: true
            status: Ui.Status.Error
            message: store.error
            actionText: "Retry"
            onActionTriggered: store.reload()
        }
        Ui.Banner {
            objectName: "entityActionError"
            visible: store.actionError !== ""
            Layout.fillWidth: true
            status: Ui.Status.Error
            message: store.actionError
            actionText: "Dismiss"
            onActionTriggered: store.clearActionError()
        }
        RowLayout {
            Layout.fillWidth: true
            visible: store.canUndo
            spacing: Ui.Metrics.xs
            Ui.Banner {
                objectName: "entityRemovedBanner"
                Layout.fillWidth: true
                status: Ui.Status.Info
                message: "Removed “" + store.removedName + "”."
                actionText: "Undo"
                onActionTriggered: store.undoRemove()
            }
            Ui.ToolbarIconButton {
                objectName: "entityRemovedDismiss"
                iconName: "close"
                accessibleName: "Dismiss"
                onClicked: store.dismissRemoved()
            }
        }
        Ui.EmptyState {
            objectName: "entityEmpty"
            visible: panel.configured && !store.loading && store.error === "" && panel.listEmpty
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignHCenter
            Layout.topMargin: Ui.Metrics.xl
            maxTextWidth: panel.width - 2 * Ui.Metrics.md
            title: "No entities yet"
            message: "Tag an image as a character, location, style, or prop to reuse it across shots."
            actionText: "New entity"
            onActionTriggered: panel.startCreate()
        }
        Item { visible: panel.listEmpty; Layout.fillWidth: true; Layout.fillHeight: true }
        GridView {
            id: grid
            objectName: "entityGrid"
            readonly property real minimumCard: 140 * Ui.Theme.uiScale
            readonly property real gap: Ui.Metrics.md
            readonly property real usableWidth: Math.max(0, width - Ui.Metrics.md)
            readonly property int columns: Math.max(1, Math.floor((usableWidth + gap) / (minimumCard + gap)))
            readonly property real cardWidth: Math.max(0, (usableWidth + gap) / columns - gap)
            visible: !panel.listEmpty
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            cellWidth: cardWidth + gap
            cellHeight: probe.implicitHeight + gap
            model: store.entities
            // A new model list snaps the view to the top before any handler can read the old offset.
            // So remember the last offset, and when a jump to zero is followed by a model change in
            // the same turn, put the view back where it was.
            property real heldY: 0
            property bool jumpedToTop: false
            onContentYChanged: {
                if (contentY === 0 && heldY > 0) {
                    jumpedToTop = true
                    Qt.callLater(() => { jumpedToTop = false })
                } else {
                    heldY = contentY
                    jumpedToTop = false
                }
            }
            onModelChanged: {
                if (!jumpedToTop) return
                Qt.callLater(() => { contentY = Math.max(0, Math.min(heldY, contentHeight - height)) })
            }
            ScrollBar.vertical: Ui.ScrollBar {}
            delegate: EntityCard {
                required property var modelData
                required property int index
                entity: modelData
                imageUrl: store.imageUrls[modelData.referenceAssetId] || ""
                selected: panel.selectedId === modelData.id
                width: grid.cardWidth
                onActiveFocusChanged: {
                    if (!activeFocus) return
                    panel.selectedId = modelData.id
                    grid.positionViewAtIndex(index, GridView.Contain)
                }
                onEditRequested: panel.edit(modelData)
                onRemoveRequested: panel.removeEntity(modelData)
            }
        }
    }

    EntityEditorDialog {
        id: editor
        library: store
        onChangeImageRequested: panel.startChangeImage()
    }
    EntityImagePickerDialog {
        id: picker
        library: store
        onPicked: id => {
            close()
            if (panel.changingImage) {
                editor.referenceAssetId = id
            } else {
                editor.returnFocusTo = returnFocusTo
                Qt.callLater(() => editor.openNew(id))
            }
        }
    }
}
