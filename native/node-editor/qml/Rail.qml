import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web editor's left icon rail.
Rectangle {
    id: root
    EditorRoles { id: roles }
    color: roles.chrome
    implicitWidth: roles.railWidth
    Rectangle { anchors.right: parent.right; height: parent.height; width: Ui.Metrics.border; color: roles.divider }
    component RailButton: PanelRow {
        id: button
        property string glyph: ""
        property string primitiveGlyph: ""
        Layout.alignment: Qt.AlignHCenter
        Layout.preferredWidth: Ui.Metrics.comfortable
        Layout.preferredHeight: Ui.Metrics.compact
        Ui.Icon { anchors.centerIn: parent; visible: button.primitiveGlyph !== ""; name: button.primitiveGlyph; size: Ui.Metrics.iconMd; tone: button.active ? Ui.Text.Primary : Ui.Text.Secondary }
        TypeIcon { anchors.centerIn: parent; visible: button.glyph !== ""; name: button.glyph; size: Ui.Metrics.iconMd; ink: button.active ? Ui.Theme.textPrimary : Ui.Theme.textSecondary }
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.topMargin: Ui.Metrics.md
        anchors.bottomMargin: Ui.Metrics.lg
        anchors.rightMargin: Ui.Metrics.border
        spacing: Ui.Metrics.md
        Image { Layout.alignment: Qt.AlignHCenter; Layout.preferredWidth: Ui.Metrics.iconLg; Layout.preferredHeight: Ui.Metrics.iconLg; source: "qrc:/editor/resources/nodetool_48px.png"; sourceSize: Qt.size(48, 48); fillMode: Image.PreserveAspectFit; Accessible.name: "NodeTool" }
        Item { Layout.preferredHeight: Ui.Metrics.xs }
        RailButton { objectName: "rail-workflows"; text: "Workflows"; glyph: "folderOpen"; active: editor && editor.browserVisible; onClicked: editor.action("Workflows") }
        RailButton { objectName: "rail-nodes"; text: "Nodes"; glyph: "hub"; active: editor && editor.catalogVisible; onClicked: editor.action("Toggle nodes") }
        RailButton { objectName: "rail-inspector"; text: "Inspector"; primitiveGlyph: "tune"; active: editor && editor.inspectorVisible; onClicked: editor.action("Toggle inspector") }
        RailButton { objectName: "rail-output"; text: "Output"; glyph: "article"; active: editor && editor.outputVisible; onClicked: editor.action("Output") }
        Item { Layout.fillHeight: true }
        Ui.Separator { Layout.fillWidth: true; Layout.leftMargin: Ui.Metrics.md; Layout.rightMargin: Ui.Metrics.md }
        RailButton { objectName: "rail-theme"; text: Ui.Theme.dark ? "Light" : "Dark"; primitiveGlyph: "sunny"; onClicked: Ui.Theme.preference = Ui.Theme.dark ? Ui.Theme.Light : Ui.Theme.Dark }
    }
}
