// The Edit Marker dialog: name, notes, colour, duration and author. Save applies
// every changed field as one undoable edit.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
    id: dialog
    objectName: "markerEditDialog"
    property var timeline: null
    // The id of the marker being edited, or "".
    property string markerId: ""
    property var marker: ({})
    property string colorCss: ""
    readonly property real fps: timeline ? timeline.fps : 30
    readonly property bool durationValid: durationField.text.trim() === "" || (Number.isFinite(Number(durationField.text)) && Number(durationField.text) >= 0)
    readonly property bool canSave: markerId !== "" && durationValid
    readonly property alias nameText: nameField
    readonly property alias notesText: notesField
    readonly property alias authorText: authorField
    readonly property alias durationText: durationField
    readonly property alias saveButton: save

    function find(id) {
        const list = timeline ? timeline.markers : []
        for (const m of list) {
            if (m.id === id) return m
        }
        return null
    }
    function openFor(id) {
        const m = find(id)
        if (!m) return
        markerId = id
        marker = m
        nameField.text = m.label ?? ""
        notesField.text = m.note ?? ""
        authorField.text = m.author ?? ""
        durationField.text = m.durationMs > 0 ? String(m.durationMs / 1000) : ""
        colorCss = m.color ?? ""
        notesScroll.contentY = 0
        open()
    }
    // The fields that differ from the marker as it was opened.
    function changes() {
        const patch = {}
        if (nameField.text !== (marker.label ?? "")) patch.label = nameField.text
        if (notesField.text !== (marker.note ?? "")) patch.note = notesField.text
        if (authorField.text !== (marker.author ?? "")) patch.author = authorField.text
        if (colorCss.toLowerCase() !== (marker.color ?? "").toLowerCase()) patch.color = colorCss
        const ms = durationField.text.trim() === "" ? 0 : Math.round(Number(durationField.text) * 1000)
        if (ms !== (marker.durationMs ?? 0)) patch.durationMs = ms
        return patch
    }
    function submit() {
        if (!canSave) return
        const patch = changes()
        if (Object.keys(patch).length > 0) timeline.applyEdit("markers.update", {ids: [markerId], patch: patch})
        close()
    }
    function remove() {
        if (markerId === "") return
        timeline.applyEdit("markers.remove", {ids: [markerId]})
        close()
    }

    title: "Edit marker"
    width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width - Ui.Metrics.xl * 2 : Ui.Metrics.dialogCompactWidth)
    height: Math.min(implicitHeight, parent ? parent.height - Ui.Metrics.xl * 2 : implicitHeight)
    spacing: Ui.Metrics.micro - topPadding
    onOpened: { nameField.forceActiveFocus(); nameField.selectAll() }
    onClosed: { markerId = ""; marker = ({}) }
    // The marker may be deleted or undone while the dialog is open.
    Connections {
        target: dialog.timeline
        function onMarkersChanged() {
            if (dialog.visible && !dialog.find(dialog.markerId)) dialog.close()
        }
    }

    component FieldLabel: Ui.Text {
        Layout.fillWidth: true
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        wrapMode: Text.Wrap
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.md
        Flickable {
            id: notesScroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            implicitHeight: body.implicitHeight
            clip: true
            contentWidth: width
            contentHeight: body.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                id: body
                width: notesScroll.width - (notesScroll.height + 2 < body.implicitHeight ? Ui.Metrics.md : 0)
                spacing: Ui.Metrics.lg
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    FieldLabel { text: "Name" }
                    Ui.TextField {
                        id: nameField
                        objectName: "markerNameField"
                        Layout.fillWidth: true
                        accessibleName: "Name"
                        selectByMouse: true
                        onAccepted: dialog.submit()
                    }
                    Ui.Text {
                        objectName: "markerTime"
                        text: "At " + MarkerSession.timecode(dialog.marker.timeMs ?? 0, dialog.fps)
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                    }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    FieldLabel { text: "Notes" }
                    Ui.TextArea {
                        id: notesField
                        objectName: "markerNotesField"
                        Layout.fillWidth: true
                        Layout.minimumHeight: Ui.Metrics.touch * 2
                        accessibleName: "Notes"
                        selectByMouse: true
                        placeholderText: "What should change here?"
                        KeyNavigation.priority: KeyNavigation.BeforeItem
                        KeyNavigation.tab: durationField
                        KeyNavigation.backtab: nameField
                    }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    FieldLabel { text: "Colour" }
                    Flow {
                        id: swatches
                        objectName: "markerColors"
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.sm
                        Repeater {
                            model: [{id: "none", name: "Default", css: ""}].concat(MarkerSession.colors())
                            delegate: Rectangle {
                                id: swatch
                                required property var modelData
                                readonly property bool chosen: dialog.colorCss.toLowerCase() === modelData.css.toLowerCase()
                                objectName: "markerColor_" + modelData.id
                                width: Ui.Metrics.xxl
                                height: Ui.Metrics.xxl
                                radius: Ui.Metrics.radiusPill
                                color: modelData.css === "" ? "transparent" : modelData.css
                                border.width: chosen ? Ui.Metrics.focus : Ui.Metrics.border
                                border.color: chosen ? Ui.Theme.borderFocus : modelData.css === "" ? Ui.Theme.borderStrong : Ui.Theme.borderControl
                                activeFocusOnTab: true
                                Accessible.role: Accessible.RadioButton
                                Accessible.name: modelData.name
                                Accessible.checked: chosen
                                Accessible.onPressAction: dialog.colorCss = modelData.css
                                Keys.onSpacePressed: dialog.colorCss = modelData.css
                                Keys.onReturnPressed: dialog.colorCss = modelData.css
                                Ui.Icon {
                                    anchors.centerIn: parent
                                    visible: swatch.modelData.css === ""
                                    name: "close"
                                    size: Ui.Metrics.iconXs
                                    tone: Ui.Text.Secondary
                                }
                                Rectangle {
                                    anchors.fill: parent
                                    anchors.margins: -Ui.Metrics.micro
                                    radius: Ui.Metrics.radiusPill
                                    color: "transparent"
                                    visible: swatch.activeFocus
                                    border.width: Ui.Metrics.focus
                                    border.color: Ui.Theme.borderFocus
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: { dialog.colorCss = swatch.modelData.css; swatch.forceActiveFocus() }
                                }
                                Ui.Tooltip { trigger: swatch; text: swatch.modelData.name; visible: hover.hovered }
                                HoverHandler { id: hover }
                            }
                        }
                    }
                }
                GridLayout {
                    Layout.fillWidth: true
                    columns: body.width < Ui.Metrics.dialogCompactWidth ? 1 : 2
                    columnSpacing: Ui.Metrics.md
                    rowSpacing: Ui.Metrics.lg
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.preferredWidth: 1
                        spacing: Ui.Metrics.xs
                        FieldLabel { text: "Duration" }
                        Ui.TextField {
                            id: durationField
                            objectName: "markerDurationField"
                            Layout.fillWidth: true
                            accessibleName: "Duration in seconds"
                            suffix: "s"
                            selectByMouse: true
                            valid: dialog.durationValid
                            errorText: "Enter a number of seconds, or leave it empty for a single point."
                            placeholderText: "0"
                            onAccepted: dialog.submit()
                        }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.preferredWidth: 1
                        spacing: Ui.Metrics.xs
                        FieldLabel { text: "Author" }
                        Ui.TextField {
                            id: authorField
                            objectName: "markerAuthorField"
                            Layout.fillWidth: true
                            accessibleName: "Author"
                            selectByMouse: true
                            onAccepted: dialog.submit()
                        }
                    }
                }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.EditorButton {
                objectName: "markerEditDelete"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                text: "Delete"
                iconName: "deleteOutline"
                textTone: Ui.Text.Error
                iconTone: Ui.Text.Error
                onClicked: dialog.remove()
            }
            Item { Layout.fillWidth: true }
            Ui.EditorButton {
                objectName: "markerCancel"
                density: Ui.EditorButton.Compact
                text: "Cancel"
                onClicked: dialog.close()
            }
            Ui.EditorButton {
                id: save
                objectName: "markerSave"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Primary
                text: "Save"
                enabled: dialog.canSave
                disabledReason: "Fix the duration to save."
                onClicked: dialog.submit()
            }
        }
    }
}
