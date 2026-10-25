import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
Item {
    id: root
    property alias title: heading.title
    property alias icon: heading.icon
    property alias meta: heading.meta
    property alias checked: heading.checked
    property alias checkboxDisabled: heading.checkboxDisabled
    property alias checkable: heading.checkable
    property alias action: heading.action
    property bool defaultOpen: true
    property bool open: defaultOpen
    property bool divider: true
    default property alias content: body.data
    signal toggled(bool open)
    signal checkedChangedByUser(bool next)
    implicitHeight: header.height + Theme.spacingXs + (open ? body.implicitHeight + Theme.spacingMicro + Theme.spacingMd : 0)
    Rectangle { width: parent.width; height: root.divider ? 1 : 0; color: Theme.divider }
    Item {
        id: header
        y: Theme.spacingXs
        width: parent.width
        height: Theme.controlXs
        MouseArea { anchors.fill: parent; onClicked: { root.open = !root.open; root.toggled(root.open) } }
        Keys.onReturnPressed: { root.open = !root.open; root.toggled(root.open) }
        Keys.onSpacePressed: { root.open = !root.open; root.toggled(root.open) }
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: heading.title
        Text { text: root.open ? "⌄" : "›"; color: Theme.textSecondary; font.pixelSize: Theme.fontSizeSmall }
        InspectorSectionTitle {
            id: heading
            x: Theme.spacingXl
            width: parent.width - x
            onCheckedChangedByUser: next => root.checkedChangedByUser(next)
        }
    }
    Column {
        id: body
        visible: root.open
        x: InspectorTokens.sectionIndent
        y: header.y + header.height + Theme.spacingMicro
        width: parent.width - x
        spacing: Theme.spacingMicro
    }
}
