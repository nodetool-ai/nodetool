import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// On-screen keyboard of the web KeyboardShortcutsView. A key lit in the accent
// color has a shortcut in the shown category. A greyed key has one in another
// category. Hovering or pressing a lit key lists the shortcuts that use it.
Rectangle {
    id: root
    // Keys are the web layout ids: lower case, space-separated per row.
    readonly property var layouts: ({
        english: [
            "escape 1 2 3 4 5 6 7 8 9 0 - = backspace",
            "tab q w e r t y u i o p [ ] \\",
            "capslock a s d f g h j k l ; ' enter",
            "shift z x c v b n m , . / shift",
            "control alt meta space alt control"
        ],
        german: [
            "escape 1 2 3 4 5 6 7 8 9 0 ß ' backspace",
            "tab q w e r t z u i o p ü + #",
            "capslock a s d f g h j k l ö ä enter",
            "shift < y x c v b n m , . - shift",
            "control alt meta space alt control"
        ]
    })
    property string layoutName: "english"
    property string os: "win"
    property string category: "editor"
    // Help rows: { label, category, combos: [[web key names]] }.
    property var shortcuts: []
    property string pressedKey: ""
    readonly property real unit: Ui.Metrics.xxxl * 1.25
    readonly property var display: ({
        backspace: "⌫",
        capslock: "⇪",
        shift: "⇧",
        control: os === "mac" ? "⌃" : "CTRL",
        meta: os === "mac" ? "⌘" : "Win",
        alt: os === "mac" ? "⌥" : "Alt",
        enter: "⏎",
        space: "SPACE",
        escape: "ESC"
    })

    function keyId(name) {
        const low = name.toLowerCase()
        if (low === " ") {
            return "space"
        }
        return low === "option" ? "alt" : low
    }
    function osKey(name) {
        return os === "mac" && name === "Control" ? "Meta" : name
    }
    function humanKey(name) {
        const key = osKey(name)
        const known = { Control: "CTRL", Meta: "⌘", Alt: "ALT", Shift: "SHIFT", " ": "SPACE",
            ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
            Escape: "ESC", Enter: "ENTER", Backspace: "BACKSPACE", Delete: "DEL" }
        return known[key] !== undefined ? known[key] : key.toUpperCase()
    }
    function comboText(combo) {
        return combo.map(humanKey).join(" + ")
    }
    function titlesFor(id) {
        const found = []
        for (const row of shortcuts) {
            if (row.category !== category) {
                continue
            }
            for (const combo of row.combos) {
                if (combo.some(name => keyId(osKey(name)) === id)) {
                    found.push(row.label + ": " + comboText(combo))
                    break
                }
            }
        }
        return found
    }
    function usedKeys(onlyCategory) {
        const used = ({})
        for (const row of shortcuts) {
            if (onlyCategory && row.category !== category) {
                continue
            }
            for (const combo of row.combos) {
                for (const name of combo) {
                    used[keyId(osKey(name))] = true
                }
            }
        }
        return used
    }
    function weight(id) {
        if (id === "control" || id === "alt" || id === "meta") {
            return 2
        }
        if (id === "space") {
            return 6
        }
        if (id.length > 1) {
            return 1.5
        }
        return 1
    }

    readonly property var active: usedKeys(true)
    readonly property var anywhere: usedKeys(false)
    implicitHeight: column.implicitHeight + Ui.Metrics.md * 2
    color: Ui.Theme.surfaceCanvas
    radius: Ui.Metrics.radiusOverlay
    border.width: Ui.Metrics.border
    border.color: Ui.Theme.borderSubtle

    Column {
        id: column
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm
        Repeater {
            model: root.layouts[root.layoutName]
            delegate: RowLayout {
                id: keyRow
                required property string modelData
                width: column.width
                spacing: Ui.Metrics.sm
                Repeater {
                    model: keyRow.modelData.split(" ")
                    delegate: Rectangle {
                        id: key
                        required property string modelData
                        readonly property bool lit: root.active[modelData] === true
                        readonly property bool elsewhere: !lit && root.anywhere[modelData] === true
                        readonly property bool pressed: root.pressedKey === modelData
                        readonly property var titles: lit ? root.titlesFor(modelData) : []
                        readonly property string caption: root.display[modelData] !== undefined ? root.display[modelData] : modelData.toUpperCase()
                        objectName: "shortcut-key-" + modelData
                        Layout.fillWidth: modelData !== "control" && modelData !== "alt" && modelData !== "meta"
                        Layout.preferredWidth: root.unit * root.weight(modelData)
                        implicitHeight: Ui.Metrics.touch
                        radius: Ui.Metrics.radiusControl
                        color: lit ? (hover.hovered || pressed ? Ui.Theme.accentHover : Ui.Theme.accentPrimary)
                                   : elsewhere ? Ui.Theme.actionDisabled : Ui.Theme.surfacePanel
                        border.width: pressed ? Ui.Metrics.focus : 0
                        border.color: Ui.Theme.borderFocus
                        Accessible.role: Accessible.StaticText
                        Accessible.name: caption + (lit ? ": " + titles.join(", ") : "")
                        Ui.Text {
                            anchors.centerIn: parent
                            text: key.caption
                            role: Ui.Typography.SansLabel
                            tone: key.lit ? Ui.Text.OnAccent : Ui.Text.Disabled
                        }
                        HoverHandler {
                            id: hover
                        }
                        Ui.Tooltip {
                            trigger: key
                            visible: key.titles.length > 0 && (hover.hovered || key.pressed)
                            text: key.titles.join("\n")
                        }
                    }
                }
            }
        }
    }
}
