import QtQuick
import QtQuick.Layouts
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
            delegate: Ui.MenuItem {
                required property var modelData
                required property int index
                objectName: "tool-toggle-" + index
                text: modelData.label
                iconName: root.glyphs[index]
                enabled: root.writable
                checkable: true
                checked: modelData.ids.every(id => root.selected.some(item => item.name === id))
                onTriggered: root.toggle(modelData)
            }
            onObjectAdded: (index, object) => toolsMenu.insertItem(index, object)
            onObjectRemoved: (index, object) => toolsMenu.removeItem(object)
        }
    }
}
