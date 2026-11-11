import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "tools-editor-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    signal valueCommitted(var value)
    spacing: Ui.Metrics.xs
    readonly property var entries: [{"label": "Read file in workspace", "ids": ["read_file"]}, {"label": "Write file in workspace", "ids": ["write_file"]}, {"label": "List files in workspace", "ids": ["list_directory"]}, {"label": "Search the web", "ids": ["google_search"]}, {"label": "Browse the web", "ids": ["browser_view", "browser_navigate", "browser_restart", "browser_click", "browser_input_text", "browser_move_mouse", "browser_press_key", "browser_select_option", "browser_scroll", "browser_console_exec", "browser_console_view"]}, {"label": "Sandbox shell, files, and browser", "ids": ["sandbox_shell_exec", "sandbox_shell_wait", "sandbox_shell_view", "sandbox_shell_write", "sandbox_shell_kill", "sandbox_file_read", "sandbox_file_write", "sandbox_file_str_replace", "sandbox_file_find_in_content", "sandbox_file_find_by_name", "sandbox_browser_view", "sandbox_browser_navigate", "sandbox_browser_restart", "sandbox_browser_click", "sandbox_browser_input_text", "sandbox_browser_move_mouse", "sandbox_browser_press_key", "sandbox_browser_select_option", "sandbox_browser_scroll", "sandbox_browser_console_exec", "sandbox_browser_console_view"]}]
    readonly property var selected: value && typeof value !== "string" && typeof value.length === "number" ? Array.from(value) : []
    function cancelEdit() {}
    function resetScope() {}
    readonly property var glyphs: ["descriptionOutlined", "editNote", "folderOutlined", "search", "language", "lock"]
    function toggle(entry) {
        const checked = entry.ids.every(id => selected.some(item => item.name === id))
        const next = selected.filter(item => !entry.ids.includes(item.name))
        if (!checked) {
            entry.ids.forEach(id => next.push(Object.assign({}, selected.find(item => item.name === id) || {}, {type: "tool_name", name: id})))
        }
        root.valueCommitted(next)
    }
    RowLayout {
        spacing: Ui.Metrics.md
        Repeater {
            model: root.entries
            delegate: Ui.ToolbarIconButton {
                required property var modelData
                required property int index
                objectName: "tool-selected-" + index
                accessibleName: modelData.label
                iconName: root.glyphs[index]
                visible: modelData.ids.every(id => root.selected.some(item => item.name === id))
                enabled: root.writable
                active: true
                onClicked: root.toggle(modelData)
            }
        }
        Ui.MenuButton {
            objectName: "tools-menu"
            accessibleName: "Add or remove tools"
            iconName: "add"
            trailingIconName: ""
            enabled: root.writable
            menu: toolsMenu
        }
    }
    Ui.ContextMenu {
        id: toolsMenu
        Instantiator {
            model: root.entries
            delegate: Basic.MenuItem {
                id: entry
                required property var modelData
                required property int index
                readonly property bool entryChecked: modelData.ids.every(id => root.selected.some(item => item.name === id))
                objectName: "tool-toggle-" + index
                text: modelData.label
                enabled: root.writable
                leftPadding: Ui.Metrics.md
                rightPadding: Ui.Metrics.md
                implicitHeight: Math.max(Ui.Metrics.compact, label.implicitHeight + Ui.Metrics.md)
                // Kind icon first, label, then the selection box at the trailing edge, as in ToolsListProperty.tsx.
                contentItem: RowLayout {
                    spacing: Ui.Metrics.sm
                    Ui.Icon {
                        name: root.glyphs[entry.index]
                        tone: entry.enabled ? Ui.Text.Primary : Ui.Text.Disabled
                        Layout.preferredWidth: Ui.Metrics.iconSm
                        Layout.preferredHeight: Ui.Metrics.iconSm
                        Layout.alignment: Qt.AlignVCenter
                    }
                    Ui.Text {
                        id: label
                        text: entry.text
                        role: Ui.Typography.SansLabel
                        tone: entry.enabled ? Ui.Text.Primary : Ui.Text.Disabled
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                        Layout.alignment: Qt.AlignVCenter
                    }
                    Rectangle {
                        objectName: "tool-check-" + entry.index
                        implicitWidth: Ui.Metrics.iconSm
                        implicitHeight: Ui.Metrics.iconSm
                        radius: Ui.Metrics.micro
                        color: !entry.enabled ? Ui.Theme.actionDisabled : entry.entryChecked ? Ui.Theme.accentPrimary : Ui.Theme.surfaceInput
                        border.width: Ui.Metrics.border
                        border.color: Ui.Theme.borderControl
                        Layout.alignment: Qt.AlignVCenter
                        Ui.Icon {
                            anchors.centerIn: parent
                            visible: entry.entryChecked
                            name: "check"
                            size: Ui.Metrics.iconXs
                            tone: entry.enabled ? Ui.Text.OnAccent : Ui.Text.Disabled
                        }
                    }
                }
                background: Rectangle {
                    color: entry.highlighted ? Ui.Theme.actionSelected : entry.hovered ? Ui.Theme.actionHover : "transparent"
                    radius: Ui.Metrics.radiusControl
                    border.width: entry.visualFocus ? Ui.Metrics.focus : 0
                    border.color: Ui.Theme.borderFocus
                }
                onTriggered: root.toggle(modelData)
            }
            onObjectAdded: (index, object) => toolsMenu.insertItem(index, object)
            onObjectRemoved: (index, object) => toolsMenu.removeItem(object)
        }
    }
}
