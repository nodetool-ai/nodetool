import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Rectangle {
    id: root
    required property var dispatch
    required property var rows
    required property bool help
    property string query: ""
    property var filtered: rows.filter(row => (row.label + " " + row.section).toLowerCase().includes(query.toLowerCase()))
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    function activate() { search.forceActiveFocus(Qt.PopupFocusReason) }
    function choose() { if (!help && list.currentIndex >= 0 && filtered[list.currentIndex].available) dispatch.choose(filtered[list.currentIndex].label) }
    function move(delta) { list.currentIndex = Math.max(0, Math.min(list.count - 1, list.currentIndex + delta)); list.positionViewAtIndex(list.currentIndex, ListView.Contain) }
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape) { dispatch.choose(""); event.accepted = true }
        else if (event.key === Qt.Key_Down) { move(1); event.accepted = true }
        else if (event.key === Qt.Key_Up) { move(-1); event.accepted = true }
        else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { choose(); event.accepted = true }
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            Ui.Text { Layout.fillWidth: true; text: root.help ? "Keyboard shortcuts" : "Command menu"; role: Ui.Typography.SansTitle }
            Ui.EditorButton { text: "Close"; variant: Ui.EditorButton.Flat; onClicked: root.dispatch.choose("") }
        }
        Ui.TextField {
            id: search
            objectName: "action-search"
            Layout.fillWidth: true
            placeholderText: root.help ? "Search shortcuts" : "Search commands"
            accessibleName: placeholderText
            onValuePreviewed: value => { root.query = value; list.currentIndex = 0 }
            Keys.priority: Keys.BeforeItem
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Escape) { root.dispatch.choose(""); event.accepted = true }
                else if (event.key === Qt.Key_Down) { root.move(1); event.accepted = true }
                else if (event.key === Qt.Key_Up) { root.move(-1); event.accepted = true }
                else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { root.choose(); event.accepted = true }
            }
            Component.onCompleted: forceActiveFocus()
        }
        ListView {
            id: list
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: root.filtered
            currentIndex: count > 0 ? 0 : -1
            section.property: "section"
            section.delegate: Ui.Text { required property string section; text: section; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            delegate: PanelRow {
                id: row
                required property var modelData
                required property int index
                width: ListView.view.width - Ui.Metrics.md
                implicitHeight: Ui.Metrics.standard
                leftPadding: Ui.Metrics.md
                rightPadding: Ui.Metrics.md
                accessibleName: modelData.label
                contentItem: RowLayout {
                    Ui.Text { Layout.fillWidth: true; text: row.modelData.label; role: Ui.Typography.SansLabel; tone: row.enabled ? Ui.Text.Primary : Ui.Text.Disabled; elide: Text.ElideRight }
                    Ui.Text { text: row.modelData.keys; role: Ui.Typography.SansCaption; tone: row.enabled ? Ui.Text.Secondary : Ui.Text.Disabled }
                }
                enabled: root.help || modelData.available
                active: !root.help && list.currentIndex === index
                onClicked: if (!root.help) root.dispatch.choose(modelData.label)
            }
        }
        Ui.Text { visible: list.count === 0; text: "No matching commands"; role: Ui.Typography.SansCaption }
    }
}
