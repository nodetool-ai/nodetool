// Mirrors web/src/components/timeline/TimelineShortcutsDialog.tsx: every
// timeline shortcut, grouped by task, with the keyboard-layout switch at the
// top, in a two-column sheet. The rows and the keys come from the web
// (Keymap.h shortcutSheet), so the sheet shows what the keys do here.
// Opened with `?` or the toolbar help button; Escape or the close button
// closes it.
import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Window
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: sheet
    objectName: "shortcutsSheet"
    required property ClipGestureController gestures
    property bool open: false
    readonly property var content: open && gestures.keyboardPreset !== "" ? gestures.shortcutSheet() : ({ groups: [] })

    onOpenChanged: {
        if (open) {
            modal.returnFocusTo = sheet.Window.window ? sheet.Window.window.activeFocusItem : null
            if (sheet.Window.window) modal.open()
        } else modal.close()
    }
    // ShortcutHint: a key chip per key, "+" between them, Shift as ⇧.
    component KeyChips: Row {
        id: chips
        property var keys: []
        readonly property var symbols: ({ shift: "⇧", arrowup: "↑", arrowdown: "↓", arrowleft: "←",
                                          arrowright: "→", enter: "↵", escape: "⎋", esc: "⎋",
                                          backspace: "⌫", "delete": "⌦", tab: "⇥", space: "␣" })
        spacing: Ui.Metrics.micro
        Repeater {
            model: chips.keys
            delegate: Row {
                required property string modelData
                required property int index
                spacing: Ui.Metrics.micro
                Ui.Text {
                    visible: parent.index > 0
                    anchors.verticalCenter: parent.verticalCenter
                    text: "+"
                    opacity: 0.7
                    role: Ui.Typography.SansCaption
                }
                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    height: 14
                    width: Math.max(14, keyText.implicitWidth + 2 * Ui.Metrics.micro)
                    radius: Ui.Metrics.micro
                    color: Ui.Theme.actionHover
                    Ui.ShortcutHint {
                        id: keyText
                        anchors.centerIn: parent
                        text: chips.symbols[parent.parent.modelData.toLowerCase()]
                              ?? parent.parent.modelData.charAt(0).toUpperCase() + parent.parent.modelData.slice(1)
                        tone: Ui.Text.Primary
                    }
                }
            }
        }
    }

    Ui.Dialog {
        id: modal
        objectName: "shortcutsDialog"
        focus: true
        width: parent ? Math.max(0, Math.min(TimelineMetrics.shortcutsDialogWidth, parent.width - 2 * Ui.Metrics.dialogNarrowInset)) : TimelineMetrics.shortcutsDialogWidth
        height: parent ? Math.max(0, parent.height - 2 * Ui.Metrics.dialogNarrowInset) : TimelineMetrics.shortcutsDialogWidth
        closePolicy: Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutside
        onClosed: if (sheet.open) sheet.open = false
        contentItem: Item {
            id: panel
            objectName: "shortcutsPanel"
            focus: true
            Keys.onPressed: event => {
                if (event.text === "?") {
                    sheet.open = false
                    event.accepted = true
                }
            }

            Ui.Text {
                id: title
                x: Ui.Metrics.xl
                y: Ui.Metrics.xl
                text: sheet.content.title ?? "Keyboard shortcuts"
                role: Ui.Typography.SansTitle
            }
            ToolButton {
                objectName: "shortcutsClose"
                anchors.right: parent.right
                anchors.rightMargin: Ui.Metrics.md
                anchors.verticalCenter: title.verticalCenter
                label: "Close"
                iconOnly: true
                iconName: "close"
                onClicked: sheet.open = false
            }
            // The title's rule.
            Rectangle {
                y: title.y + title.height + Ui.Metrics.lg
                width: parent.width
                height: 1
                color: Ui.Theme.borderSubtle
            }
            // The layout switch.
            Column {
                id: layoutRow
                x: Ui.Metrics.xl
                y: title.y + title.height + Ui.Metrics.lg + Ui.Metrics.xl
                width: parent.width - 2 * Ui.Metrics.xl
                height: childrenRect.height
                spacing: Ui.Metrics.xs
                Ui.Text {
                    text: sheet.content.layout ?? "Layout"
                    role: Ui.Typography.SansLabel
                    tone: Ui.Text.Secondary
                }
                Flow {
                    width: parent.width
                    height: childrenRect.height
                    spacing: Ui.Metrics.xs
                    Repeater {
                        model: ["nodetool", "premiere", "fcp"]
                        delegate: ToolButton {
                            required property string modelData
                            objectName: "preset_" + modelData
                            label: sheet.content.presets ? sheet.content.presets[modelData] : modelData
                            active: sheet.gestures.keyboardPreset === modelData
                            onClicked: sheet.gestures.keyboardPreset = modelData
                        }
                    }
                }
            }

            Flickable {
                id: body
                x: Ui.Metrics.xl
                y: layoutRow.y + layoutRow.height + Ui.Metrics.sm
                width: parent.width - 2 * Ui.Metrics.xl
                height: Math.max(0, footer.y - y - Ui.Metrics.xs)
                clip: true
                contentHeight: groupGrid.height
                boundsBehavior: Flickable.StopAtBounds
                readonly property bool narrow: width < Ui.Metrics.dialogCompactWidth
                readonly property double columnWidth: narrow ? width : (width - Ui.Metrics.xl) / 2
                // display grid, 2 columns: the groups fill the rows in order, a
                // row as tall as its taller group.
                Grid {
                    id: groupGrid
                    columns: body.narrow ? 1 : 2
                    columnSpacing: Ui.Metrics.xl
                    rowSpacing: Ui.Metrics.xl
                    Repeater { model: sheet.content.groups; delegate: groupDelegate }
                }
            }

            Component {
                id: groupDelegate
                Column {
                    id: group
                    required property var modelData
                    width: body.columnWidth
                    spacing: Ui.Metrics.micro
                    Ui.Text {
                        text: group.modelData.title
                        role: Ui.Typography.SansLabel
                        tone: Ui.Text.Secondary
                    }
                    Repeater {
                        model: group.modelData.rows
                        delegate: Item {
                            id: row
                            required property var modelData
                            required property int index
                            width: body.columnWidth
                            height: Math.max(rowLabel.implicitHeight, combos.height) + 2 * Ui.Metrics.xs
                            // An action the native editor does not run yet: dimmed,
                            // and said so after its label.
                            readonly property bool available: row.modelData.available !== false
                            opacity: available ? 1 : 0.45
                            Accessible.description: available ? "" : "Not in the native editor yet"
                            Ui.Text {
                                id: rowLabel
                                anchors.verticalCenter: parent.verticalCenter
                                width: parent.width - combos.width - Ui.Metrics.lg
                                wrapMode: Text.WordWrap
                                text: row.available ? row.modelData.label
                                                    : row.modelData.label + "  \u00b7  not in the native editor yet"
                                role: Ui.Typography.SansLabel
                            }
                            Row {
                                id: combos
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Ui.Metrics.xs
                                Repeater {
                                    model: row.modelData.combos
                                    delegate: Row {
                                        required property var modelData
                                        required property int index
                                        spacing: Ui.Metrics.xs
                                        Ui.Text {
                                            visible: parent.index > 0
                                            anchors.verticalCenter: parent.verticalCenter
                                            text: sheet.content.or ?? "or"
                                            role: Ui.Typography.SansCaption
                                            tone: Ui.Text.Secondary
                                        }
                                        KeyChips {
                                            anchors.verticalCenter: parent.verticalCenter
                                            keys: parent.modelData
                                        }
                                    }
                                }
                            }
                            Rectangle {
                                visible: row.index < group.modelData.rows.length - 1
                                anchors.bottom: parent.bottom
                                width: parent.width
                                height: 1
                                color: Ui.Theme.borderSubtle
                            }
                        }
                    }
                }
            }

            // Footer: "Press ? any time to toggle this panel".
            Rectangle {
                id: footer
                x: Ui.Metrics.xl
                y: parent.height - height - Ui.Metrics.md
                width: parent.width - 2 * Ui.Metrics.xl
                height: footerRow.height + Ui.Metrics.md
                color: "transparent"
                Rectangle { width: parent.width; height: 1; color: Ui.Theme.borderSubtle }
                Row {
                    id: footerRow
                    anchors.horizontalCenter: parent.horizontalCenter
                    anchors.bottom: parent.bottom
                    spacing: Ui.Metrics.micro
                    Ui.Text {
                        anchors.verticalCenter: parent.verticalCenter
                    text: body.narrow ? "Press ? to close" : sheet.content.press ?? "Press"
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                KeyChips { visible: !body.narrow; anchors.verticalCenter: parent.verticalCenter; keys: ["?"] }
                    Ui.Text {
                    visible: !body.narrow
                        anchors.verticalCenter: parent.verticalCenter
                        text: sheet.content.toggleHint ?? ""
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
            }
        }
    }
}
