import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
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
    implicitHeight: header.height + Ui.Metrics.xs + (open ? body.implicitHeight + Ui.Metrics.micro + Ui.Metrics.md : 0)
    Ui.Separator { width: parent.width; visible: root.divider }
    Item {
        id: header
        y: Ui.Metrics.xs
        width: parent.width
        height: Ui.Metrics.compact
        Ui.EditorButton {
            anchors.fill: parent
            text: ""
            iconName: root.open ? "arrowDropDown" : "navigateNext"
            accessibleName: heading.title
            menuButton: true
            menuExpanded: root.open
            variant: Ui.EditorButton.Flat
            density: Ui.EditorButton.Compact
            contentAlignment: Qt.AlignLeft
            onClicked: { root.open = !root.open; root.toggled(root.open) }
        }
        InspectorSectionTitle {
            id: heading
            x: Ui.Metrics.xxxl
            width: parent.width - x
            onCheckedChangedByUser: next => root.checkedChangedByUser(next)
        }
    }
    Column {
        id: body
        visible: root.open
        x: InspectorTokens.sectionIndent
        y: header.y + header.height + Ui.Metrics.micro
        width: parent.width - x
        spacing: Ui.Metrics.micro
    }
}
