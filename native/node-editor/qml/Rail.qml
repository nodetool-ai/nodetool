import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web editor's left icon rail: a logo, the left panel views, the theme toggle and the panel toggle.
// Source: web/src/components/panels/PanelLeft.tsx (VerticalToolbar), web/src/config/quickAccessCategories.tsx
// (LEFT_PANEL_TOP_LEVEL) and web/src/components/node_menu/QuickAccessSidebar.tsx.
Rectangle {
    id: root
    EditorRoles { id: roles }
    color: roles.chrome
    implicitWidth: roles.railWidth
    Rectangle { anchors.right: parent.right; height: parent.height; width: Ui.Metrics.border; color: roles.divider }
    // One rail button. A view with no native panel stays visible and disabled, and its tooltip says why.
    component RailEntry: Item {
        id: entry
        property string glyph: ""
        property string label: ""
        property string tip: label
        // Why this view cannot open. An empty reason means it opens.
        property string unavailable: ""
        property bool active: false
        property alias button: button
        signal activated()
        Layout.alignment: Qt.AlignHCenter
        Layout.preferredWidth: Ui.Metrics.comfortable
        Layout.preferredHeight: Ui.Metrics.compact
        PanelRow {
            id: button
            anchors.fill: parent
            text: entry.label
            active: entry.active
            enabled: entry.unavailable === ""
            onClicked: entry.activated()
            Ui.Icon {
                anchors.centerIn: parent
                name: entry.glyph
                size: Ui.Metrics.iconMd
                tone: !button.enabled ? Ui.Text.Disabled : entry.active ? Ui.Text.Primary : Ui.Text.Secondary
            }
        }
        // The hover handler sits on the wrapper, which stays enabled, so a disabled button still explains itself.
        HoverHandler {
            onHoveredChanged: {
                if (editor) {
                    editor.showToolTip(hovered ? (entry.unavailable !== "" ? entry.unavailable : entry.tip) : "")
                }
            }
        }
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.topMargin: Ui.Metrics.md
        anchors.bottomMargin: Ui.Metrics.lg
        anchors.rightMargin: Ui.Metrics.border
        spacing: Ui.Metrics.md
        Image { Layout.alignment: Qt.AlignHCenter; Layout.preferredWidth: Ui.Metrics.iconLg; Layout.preferredHeight: Ui.Metrics.iconLg; source: "qrc:/editor/resources/nodetool_48px.png"; sourceSize: Qt.size(48, 48); fillMode: Image.PreserveAspectFit; Accessible.name: "NodeTool" }
        Item { Layout.preferredHeight: Ui.Metrics.xs }
        RailEntry {
            objectName: "rail-projects"
            label: "Projects"
            glyph: "toolProjects"
            unavailable: qsTr("Projects has no native surface yet. Switch projects from the project menu in the tab strip.")
        }
        RailEntry {
            objectName: "rail-documents"
            label: "Documents"
            glyph: "folderCopyOutlined"
            active: editor && editor.browserVisible
            onActivated: editor.action("Workflows")
        }
        RailEntry {
            objectName: "rail-chats"
            label: "Chats"
            glyph: "forumOutlined"
            active: editor && editor.chatVisible
            onActivated: editor.toggleChat()
        }
        RailEntry {
            objectName: "rail-library"
            label: "Library"
            glyph: "collectionsOutlined"
            active: editor && editor.libraryVisible
            onActivated: editor.action("Library")
        }
        RailEntry {
            objectName: "rail-entities"
            label: "Entities"
            glyph: "personOutline"
            unavailable: qsTr("Entities has no native panel yet.")
        }
        RailEntry {
            objectName: "rail-examples"
            label: "Examples"
            glyph: "exploreOutlined"
            onActivated: editor.action("Examples")
        }
        RailEntry {
            objectName: "rail-nodes"
            label: "Nodes"
            glyph: "hub"
            active: editor && editor.catalogVisible
            onActivated: editor.action("Toggle nodes")
        }
        RailEntry {
            objectName: "rail-more"
            label: "More"
            glyph: "moreHoriz"
            unavailable: qsTr("The More panel has no native equivalent. Native commands are in the toolbar More menu.")
        }
        Item { Layout.fillHeight: true }
        Ui.Separator { Layout.fillWidth: true; Layout.leftMargin: Ui.Metrics.md; Layout.rightMargin: Ui.Metrics.md }
        RailEntry {
            objectName: "rail-theme"
            label: Ui.Theme.dark ? "Light" : "Dark"
            tip: Ui.Theme.dark ? qsTr("Switch to light mode") : qsTr("Switch to dark mode")
            glyph: Ui.Theme.dark ? "sunny" : "darkMode"
            onActivated: Ui.Theme.preference = Ui.Theme.dark ? Ui.Theme.Light : Ui.Theme.Dark
        }
        RailEntry {
            objectName: "rail-panel"
            label: "Toggle panel"
            glyph: "code"
            onActivated: editor.action("Toggle panel")
        }
    }
}
