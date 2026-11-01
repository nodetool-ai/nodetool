import QtQuick
import NodeTool.UiPrimitives as Ui
import "EntityKind.js" as Kind

Rectangle {
    id: card
    property var entity: ({})
    property string imageUrl: ""
    property bool selected: false
    signal editRequested()
    signal removeRequested()
    readonly property string entityId: entity && entity.id ? entity.id : ""
    readonly property string displayName: Kind.displayName(entity)
    readonly property string kind: entity && entity.kind ? entity.kind : ""
    readonly property string descriptor: entity && entity.descriptor ? entity.descriptor : ""
    // The kind sets the icon tone and nothing else, so cards stay quiet in a long list.
    readonly property int kindTone: kind === "character" ? Ui.Text.Info : kind === "location" ? Ui.Text.Success
        : kind === "style" ? Ui.Text.Warning : Ui.Text.Secondary
    readonly property bool hovered: hover.hovered
    readonly property bool actionsRevealed: hovered || activeFocus || editButton.activeFocus || removeButton.activeFocus
    // Every card has the same height whatever its descriptor, so the grid stays regular.
    readonly property real infoHeight: info.implicitHeight + 2 * Ui.Metrics.md
    function openMenu(x, y) {
        pointer.x = x
        pointer.y = y
        menu.openAt(pointer)
        menu.returnFocusTo = card
    }
    objectName: "entityCard_" + entityId
    implicitHeight: frame.height + Ui.Metrics.sm + infoHeight
    color: Ui.Theme.surfacePanel
    radius: Ui.Metrics.radiusCard
    border.width: selected || activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
    border.color: activeFocus ? Ui.Theme.borderFocus : selected ? Ui.Theme.accentPrimary : Ui.Theme.borderSubtle
    clip: true
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: displayName
    Accessible.description: Kind.label(kind) + (descriptor !== "" ? ". " + descriptor : "")
    Accessible.onPressAction: editRequested()
    Keys.onReturnPressed: editRequested()
    Keys.onEnterPressed: editRequested()
    Keys.onDeletePressed: removeRequested()
    Keys.onMenuPressed: openMenu(width / 2, height / 2)
    Keys.onPressed: event => {
        if (event.key === Qt.Key_F10 && event.modifiers === Qt.ShiftModifier) {
            openMenu(width / 2, height / 2)
            event.accepted = true
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: parent.radius
        color: card.selected ? Ui.Theme.actionSelected : card.hovered ? Ui.Theme.actionHover : "transparent"
    }
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onPressed: event => {
            card.forceActiveFocus(Qt.MouseFocusReason)
            if (event.button === Qt.RightButton) card.openMenu(event.x, event.y)
        }
    }
    HoverHandler { id: hover }
    Item { id: pointer; width: 1; height: 1 }

    // The picture sits in a rounded frame inset from the card. The border is drawn over the
    // picture, and the picture is inset by Metrics.micro so its square corners stay under it.
    Rectangle {
        id: frame
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.margins: Ui.Metrics.sm
        height: width
        color: Ui.Theme.surfaceInput
        radius: Ui.Metrics.radiusControl
        Image {
            id: picture
            objectName: "entityImage"
            anchors.fill: parent
            anchors.margins: Ui.Metrics.micro
            source: card.imageUrl
            asynchronous: true
            fillMode: Image.PreserveAspectCrop
            sourceSize: Qt.size(width * 2, height * 2)
            visible: status === Image.Ready
        }
        Column {
            objectName: "entityNoImage"
            anchors.centerIn: parent
            spacing: Ui.Metrics.xs
            visible: card.imageUrl === "" || picture.status === Image.Error
            Ui.Icon {
                anchors.horizontalCenter: parent.horizontalCenter
                name: Kind.icon(card.kind)
                size: Ui.Metrics.iconLg
                tone: Ui.Text.Secondary
            }
            Ui.Text {
                text: "No image"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
        }
        Rectangle {
            anchors.fill: parent
            radius: parent.radius
            color: "transparent"
            border.width: Ui.Metrics.border
            border.color: Ui.Theme.borderSubtle
        }
        // The actions fade in on hover or focus. They stay in the tab order while transparent.
        Rectangle {
            id: actions
            objectName: "entityActions"
            anchors.top: parent.top
            anchors.right: parent.right
            anchors.margins: Ui.Metrics.xs
            width: actionRow.width
            height: actionRow.height
            radius: Ui.Metrics.radiusControl
            color: Ui.Theme.scrimMedia
            opacity: card.actionsRevealed ? 1 : 0
            Behavior on opacity { NumberAnimation { duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionQuick } }
            Row {
                id: actionRow
                Ui.ToolbarIconButton {
                    id: editButton
                    objectName: "entityEditButton"
                    iconName: "rename"
                    iconTone: Ui.Text.OnAccent
                    accessibleName: "Edit entity " + card.displayName
                    onClicked: card.editRequested()
                }
                Ui.ToolbarIconButton {
                    id: removeButton
                    objectName: "entityRemoveButton"
                    iconName: "deleteOutline"
                    iconTone: Ui.Text.OnAccent
                    accessibleName: "Remove entity " + card.displayName
                    onClicked: card.removeRequested()
                }
            }
        }
    }

    Column {
        id: info
        anchors.top: frame.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.xs
        Ui.Text {
            objectName: "entityName"
            width: parent.width
            text: card.displayName
            role: Ui.Typography.SansLabel
            elide: Text.ElideRight
            maximumLineCount: 1
        }
        Row {
            width: parent.width
            spacing: Ui.Metrics.xs
            Ui.Icon {
                id: kindIcon
                anchors.verticalCenter: parent.verticalCenter
                name: Kind.icon(card.kind)
                size: Ui.Metrics.iconXs
                tone: card.kindTone
            }
            Ui.Text {
                objectName: "entityKind"
                width: parent.width - kindIcon.width - parent.spacing
                anchors.verticalCenter: parent.verticalCenter
                text: Kind.label(card.kind)
                role: Ui.Typography.SansCaption
                elide: Text.ElideRight
            }
        }
        Ui.Text {
            id: twoLines
            visible: false
            text: "A\nA"
            role: Ui.Typography.SansCaption
        }
        Ui.Text {
            objectName: "entityDescriptor"
            width: parent.width
            height: twoLines.implicitHeight
            text: card.descriptor
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
            maximumLineCount: 2
            elide: Text.ElideRight
        }
    }

    Ui.ContextMenu {
        id: menu
        objectName: "entityMenu"
        Ui.MenuItem { objectName: "entityMenuEdit"; text: "Edit"; iconName: "rename"; onTriggered: card.editRequested() }
        Ui.MenuItem { objectName: "entityMenuRemove"; text: "Remove"; iconName: "deleteOutline"; onTriggered: card.removeRequested() }
    }
}
