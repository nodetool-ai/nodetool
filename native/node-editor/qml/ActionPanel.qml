import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// The command menu and the keyboard shortcuts help. Help follows the web
// KeyboardShortcutsView: platform, keyboard layout and category controls above
// an on-screen keyboard, then the searchable shortcut list of the web Help
// dialog, grouped by category.
Rectangle {
    id: root
    required property var dispatch
    required property var rows
    required property bool help
    property string query: ""
    property string os: "win"
    property string layoutName: "english"
    property string category: "editor"
    readonly property var categories: [
        { value: "editor", label: qsTr("Node editor") },
        { value: "workflow", label: qsTr("Workflows") },
        { value: "panel", label: qsTr("Panels") },
        { value: "assets", label: qsTr("Assets") }
    ]
    // The web list order: workflows, panels, node editor, assets.
    readonly property var listOrder: ["workflow", "panel", "editor", "assets"]
    readonly property var categoryTitles: ({ workflow: qsTr("Workflows"), panel: qsTr("Panels"), editor: qsTr("Node editor"), assets: qsTr("Assets") })
    property var filtered: rows.filter(row => (row.label + " " + row.section).toLowerCase().includes(query.toLowerCase()))
    property var helpRows: {
        const lower = query.toLowerCase()
        const found = []
        for (const name of listOrder) {
            for (const row of rows) {
                if (row.category === name && (lower === "" || row.label.toLowerCase().includes(lower))) {
                    found.push(Object.assign({ categoryTitle: categoryTitles[name] }, row))
                }
            }
        }
        return found
    }
    readonly property var visibleRows: help ? helpRows : filtered
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    function activate() {
        if (help) {
            root.forceActiveFocus(Qt.PopupFocusReason)
        } else {
            search.forceActiveFocus(Qt.PopupFocusReason)
        }
    }
    function choose() {
        if (!help && list.currentIndex >= 0 && filtered[list.currentIndex].available) {
            dispatch.choose(filtered[list.currentIndex].label)
        }
    }
    function move(delta) {
        list.currentIndex = Math.max(0, Math.min(list.count - 1, list.currentIndex + delta))
        list.positionViewAtIndex(list.currentIndex, ListView.Contain)
    }
    function keyIdOf(event) {
        const named = {}
        named[Qt.Key_Control] = "control"
        named[Qt.Key_Shift] = "shift"
        named[Qt.Key_Alt] = "alt"
        named[Qt.Key_Meta] = "meta"
        named[Qt.Key_Escape] = "escape"
        named[Qt.Key_Return] = "enter"
        named[Qt.Key_Enter] = "enter"
        named[Qt.Key_Backspace] = "backspace"
        named[Qt.Key_Tab] = "tab"
        named[Qt.Key_Space] = "space"
        named[Qt.Key_CapsLock] = "capslock"
        if (named[event.key] !== undefined) {
            return named[event.key]
        }
        return event.text.length === 1 ? event.text.toLowerCase() : ""
    }
    function comboList(row) {
        return row.combos.map(combo => keyboard.comboText(combo)).join(" / ")
    }
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape) {
            dispatch.choose("")
            event.accepted = true
        } else if (help) {
            keyboard.pressedKey = keyIdOf(event)
            event.accepted = event.key !== Qt.Key_Tab
        } else if (event.key === Qt.Key_Down) {
            move(1)
            event.accepted = true
        } else if (event.key === Qt.Key_Up) {
            move(-1)
            event.accepted = true
        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            choose()
            event.accepted = true
        }
    }
    Keys.onReleased: event => {
        if (help) {
            keyboard.pressedKey = ""
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            Ui.Text {
                Layout.fillWidth: true
                text: root.help ? qsTr("Keyboard shortcuts") : qsTr("Command menu")
                role: Ui.Typography.SansTitle
            }
            Ui.EditorButton {
                text: qsTr("Close")
                variant: Ui.EditorButton.Flat
                onClicked: root.dispatch.choose("")
            }
        }
        Flow {
            visible: root.help
            Layout.fillWidth: true
            spacing: Ui.Metrics.lg
            Ui.SegmentedControl {
                accessibleName: "platform"
                optionNamePrefix: "help-platform-"
                options: [{ value: "mac", label: qsTr("macOS") }, { value: "win", label: qsTr("Windows/Linux") }]
                value: root.os
                onValueCommitted: value => root.os = value
            }
            Ui.SegmentedControl {
                accessibleName: "layout"
                optionNamePrefix: "help-layout-"
                options: [{ value: "english", label: qsTr("EN") }, { value: "german", label: qsTr("DE") }]
                value: root.layoutName
                onValueCommitted: value => root.layoutName = value
            }
            Ui.SegmentedControl {
                accessibleName: "category"
                optionNamePrefix: "help-category-"
                options: root.categories
                value: root.category
                onValueCommitted: value => root.category = value
            }
        }
        ShortcutKeyboard {
            id: keyboard
            objectName: "shortcut-keyboard"
            visible: root.help
            Layout.fillWidth: true
            layoutName: root.layoutName
            os: root.os
            category: root.category
            shortcuts: root.rows
        }
        Ui.TextField {
            id: search
            objectName: "action-search"
            Layout.fillWidth: true
            placeholderText: root.help ? qsTr("Search shortcuts") : qsTr("Search commands")
            accessibleName: placeholderText
            onValuePreviewed: value => {
                root.query = value
                list.currentIndex = 0
            }
            Keys.priority: Keys.BeforeItem
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Escape) {
                    root.dispatch.choose("")
                    event.accepted = true
                } else if (event.key === Qt.Key_Down) {
                    root.move(1)
                    event.accepted = true
                } else if (event.key === Qt.Key_Up) {
                    root.move(-1)
                    event.accepted = true
                } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                    root.choose()
                    event.accepted = true
                }
            }
            Component.onCompleted: if (!root.help) forceActiveFocus()
        }
        ListView {
            id: list
            objectName: "action-list"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: root.visibleRows
            currentIndex: count > 0 ? 0 : -1
            section.property: root.help ? "categoryTitle" : "section"
            section.delegate: Ui.Text {
                required property string section
                text: section
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
            }
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            delegate: Ui.ListRow {
                id: row
                flat: true
                required property var modelData
                required property int index
                width: ListView.view.width - Ui.Metrics.md
                implicitHeight: Ui.Metrics.standard
                leftPadding: Ui.Metrics.md
                rightPadding: Ui.Metrics.md
                accessibleName: modelData.label
                contentItem: RowLayout {
                    Ui.Text {
                        Layout.fillWidth: true
                        text: row.modelData.label
                        role: Ui.Typography.SansLabel
                        tone: row.enabled ? Ui.Text.Primary : Ui.Text.Disabled
                        elide: Text.ElideRight
                    }
                    Ui.Text {
                        text: root.help ? root.comboList(row.modelData) : row.modelData.keys
                        role: Ui.Typography.SansCaption
                        tone: row.enabled ? Ui.Text.Secondary : Ui.Text.Disabled
                    }
                }
                enabled: root.help || modelData.available
                active: !root.help && list.currentIndex === index
                onClicked: if (!root.help) root.dispatch.choose(modelData.label)
            }
        }
        Ui.Text {
            visible: list.count === 0
            text: root.help ? qsTr("No matching shortcuts") : qsTr("No matching commands")
            role: Ui.Typography.SansCaption
        }
    }
}
