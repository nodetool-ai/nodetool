// Mirrors web/src/components/timeline/TimelineShortcutsDialog.tsx: every
// timeline shortcut, grouped by task, with the keyboard-layout switch at the
// top, in a two-column sheet. The rows and the keys come from the web
// (Keymap.h shortcutSheet), so the sheet shows what the keys do here.
// Opened with `?` or the toolbar help button; Escape or the close button
// closes it.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: sheet
    objectName: "shortcutsSheet"
    required property ClipGestureController gestures
    property bool open: false
    readonly property var content: open && gestures.keyboardPreset !== "" ? gestures.shortcutSheet() : ({ groups: [] })

    visible: open
    color: Theme.scrim
    focus: open
    Keys.onEscapePressed: sheet.open = false
    Keys.onPressed: event => {
        if (event.text === "?") {
            sheet.open = false
            event.accepted = true
        }
    }
    // The scrim takes the pointer; a press outside the panel closes.
    MouseArea {
        anchors.fill: parent
        onClicked: sheet.open = false
        onWheel: wheel => wheel.accepted = true
    }

    // ShortcutHint: a key chip per key, "+" between them, Shift as ⇧.
    component KeyChips: Row {
        id: chips
        property var keys: []
        readonly property var symbols: ({ shift: "⇧", arrowup: "↑", arrowdown: "↓", arrowleft: "←",
                                          arrowright: "→", enter: "↵", escape: "⎋", esc: "⎋",
                                          backspace: "⌫", "delete": "⌦", tab: "⇥", space: "␣" })
        spacing: Theme.spacingMicro
        Repeater {
            model: chips.keys
            delegate: Row {
                required property string modelData
                required property int index
                spacing: Theme.spacingMicro
                Text {
                    visible: parent.index > 0
                    anchors.verticalCenter: parent.verticalCenter
                    text: "+"
                    opacity: 0.7
                    color: Theme.textPrimary
                    font.family: Theme.sansFamily
                    font.pixelSize: Theme.fontSizeSmaller
                    font.weight: Font.DemiBold
                }
                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    height: 14
                    width: Math.max(14, keyText.implicitWidth + 2 * Theme.spacingMicro)
                    radius: Theme.radiusXs
                    color: Qt.rgba(1, 1, 1, 0.06)
                    Text {
                        id: keyText
                        anchors.centerIn: parent
                        text: chips.symbols[parent.parent.modelData.toLowerCase()]
                              ?? parent.parent.modelData.charAt(0).toUpperCase() + parent.parent.modelData.slice(1)
                        color: Theme.textPrimary
                        font.family: Theme.monoFamily
                        font.pixelSize: Theme.fontSizeSmaller
                        font.weight: Font.DemiBold
                    }
                }
            }
        }
    }

    Rectangle {
        id: panel
        objectName: "shortcutsPanel"
        anchors.centerIn: parent
        width: Math.min(900, parent.width - 2 * Theme.spacingXl)       // maxWidth "md", fullWidth
        height: parent.height - 4 * Theme.spacingXl                   // the Dialog margin
        radius: Theme.radiusLg
        color: Theme.backgroundPaper
        border.width: 1
        border.color: Theme.divider
        MouseArea { anchors.fill: parent }                              // keeps a press inside open

        Text {
            id: title
            x: Theme.spacingXl
            y: Theme.spacingXl
            text: sheet.content.title ?? "Keyboard shortcuts"
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeNormal
            font.weight: Font.DemiBold
        }
        ToolButton {
            objectName: "shortcutsClose"
            anchors.right: parent.right
            anchors.rightMargin: Theme.spacingMd
            anchors.verticalCenter: title.verticalCenter
            label: "Close"
            iconOnly: true
            iconPath: Icons.close
            onClicked: sheet.open = false
        }
        // The title's rule.
        Rectangle {
            y: title.y + title.height + Theme.spacingLg
            width: parent.width
            height: 1
            color: Theme.divider
        }
        // The layout switch.
        Row {
            id: layoutRow
            x: Theme.spacingXl
            y: title.y + title.height + Theme.spacingLg + Theme.spacingXl
            spacing: Theme.spacingXs
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: sheet.content.layout ?? "Layout"
                color: Theme.textSecondary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Font.Medium
            }
            Repeater {
                model: ["nodetool", "premiere", "fcp"]
                delegate: ToolButton {
                    required property string modelData
                    objectName: "preset_" + modelData
                    anchors.verticalCenter: parent.verticalCenter
                    label: sheet.content.presets ? sheet.content.presets[modelData] : modelData
                    active: sheet.gestures.keyboardPreset === modelData
                    onClicked: sheet.gestures.keyboardPreset = modelData
                }
            }
        }

        Flickable {
            id: body
            x: Theme.spacingXl
            y: layoutRow.y + layoutRow.height + Theme.spacingSm
            width: parent.width - 2 * Theme.spacingXl
            height: footer.y - y - Theme.spacingXs
            clip: true
            contentHeight: groupGrid.height
            boundsBehavior: Flickable.StopAtBounds
            readonly property double columnWidth: (width - Theme.spacingXl) / 2
            // display grid, 2 columns: the groups fill the rows in order, a
            // row as tall as its taller group.
            Grid {
                id: groupGrid
                columns: 2
                columnSpacing: Theme.spacingXl
                rowSpacing: Theme.spacingXl
                Repeater { model: sheet.content.groups; delegate: groupDelegate }
            }
        }

        Component {
            id: groupDelegate
            Column {
                id: group
                required property var modelData
                width: body.columnWidth
                spacing: Theme.spacingMicro
                Text {
                    text: group.modelData.title
                    color: Theme.textSecondary
                    font.family: Theme.sansFamily
                    font.pixelSize: Theme.fontSizeSmall
                    font.weight: Font.Medium
                }
                Repeater {
                    model: group.modelData.rows
                    delegate: Item {
                        id: row
                        required property var modelData
                        required property int index
                        width: body.columnWidth
                        height: Math.max(rowLabel.implicitHeight, combos.height) + 2 * Theme.spacingXs
                        // An action the native editor does not run yet: dimmed,
                        // and said so after its label.
                        readonly property bool available: row.modelData.available !== false
                        opacity: available ? 1 : 0.45
                        Accessible.description: available ? "" : "Not in the native editor yet"
                        Text {
                            id: rowLabel
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width - combos.width - Theme.spacingLg
                            wrapMode: Text.WordWrap
                            text: row.available ? row.modelData.label
                                                : row.modelData.label + "  \u00b7  not in the native editor yet"
                            color: Theme.textPrimary
                            font.family: Theme.sansFamily
                            font.pixelSize: Theme.fontSizeSmall
                        }
                        Row {
                            id: combos
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: Theme.spacingXs
                            Repeater {
                                model: row.modelData.combos
                                delegate: Row {
                                    required property var modelData
                                    required property int index
                                    spacing: Theme.spacingXs
                                    Text {
                                        visible: parent.index > 0
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: sheet.content.or ?? "or"
                                        color: Theme.textSecondary
                                        font.family: Theme.sansFamily
                                        font.pixelSize: Theme.fontSizeSmaller
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
                            color: Theme.divider
                        }
                    }
                }
            }
        }

        // Footer: "Press ? any time to toggle this panel".
        Rectangle {
            id: footer
            x: Theme.spacingXl
            y: parent.height - height - Theme.spacingMd
            width: parent.width - 2 * Theme.spacingXl
            height: footerRow.height + Theme.spacingMd
            color: "transparent"
            Rectangle { width: parent.width; height: 1; color: Theme.divider }
            Row {
                id: footerRow
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom
                spacing: Theme.spacingMicro
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: sheet.content.press ?? "Press"
                    color: Theme.textSecondary
                    font.family: Theme.sansFamily
                    font.pixelSize: Theme.fontSizeSmaller
                }
                KeyChips { anchors.verticalCenter: parent.verticalCenter; keys: ["?"] }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: sheet.content.toggleHint ?? ""
                    color: Theme.textSecondary
                    font.family: Theme.sansFamily
                    font.pixelSize: Theme.fontSizeSmaller
                }
            }
        }
    }
}
