import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline

Item {
    id: root
    objectName: "ProjectSettingsDialog"
    property TimelineModel timeline: {
        for (let p = parent; p; p = p.parent) {
            if (p.timeline !== undefined) return p.timeline
        }
        return null
    }
    property alias widthText: widthField.text
    property alias heightText: heightField.text
    property alias fpsText: fpsField.text
    property var initialTempo: ({bpm: 120, timeSignature: {beatsPerBar: 4, beatUnit: 4}, offsetMs: 0})
    readonly property bool allValid: validInteger(widthText, 16, 7680) && validInteger(heightText, 16, 7680)
        && validInteger(fpsText, 1, 240) && validNumber(bpmField.text, 20, 300)
        && validInteger(beatsField.text, 1, 16) && offsetField.text.trim() !== ""
        && Number.isFinite(Number(offsetField.text)) && Number(offsetField.text) >= 0
    readonly property bool canvasDirty: timeline && (Number(widthText) !== timeline.canvasWidth
        || Number(heightText) !== timeline.canvasHeight || Number(fpsText) !== timeline.fps)
    readonly property bool tempoDirty: Number(bpmField.text) !== initialTempo.bpm
        || Number(beatsField.text) !== initialTempo.timeSignature.beatsPerBar
        || Number(beatUnit.currentText.replace("/ ", "")) !== initialTempo.timeSignature.beatUnit
        || Number(offsetField.text) !== initialTempo.offsetMs
    visible: dialog.opened
    function validNumber(text, min, max) {
        const n = Number(text)
        return text.trim() !== "" && Number.isFinite(n) && n >= min && n <= max
    }
    function validInteger(text, min, max) {
        return validNumber(text, min, max) && Number.isInteger(Number(text))
    }
    function open() {
        if (!timeline) return
        widthText = String(timeline.canvasWidth)
        heightText = String(timeline.canvasHeight)
        fpsText = String(timeline.fps)
        const raw = values.read(timeline)
        initialTempo = raw.tempo || {bpm: 120, timeSignature: {beatsPerBar: 4, beatUnit: 4}, offsetMs: 0}
        bpmField.text = String(initialTempo.bpm)
        beatsField.text = String(initialTempo.timeSignature.beatsPerBar)
        beatUnit.currentIndex = [2, 4, 8, 16].indexOf(initialTempo.timeSignature.beatUnit)
        offsetField.text = String(initialTempo.offsetMs)
        dialog.opened = true
    }
    function close() { dialog.opened = false }
    function commit() {
        if (!timeline || !allValid || (!canvasDirty && !tempoDirty)) return
        let patch = {width: Number(widthText), height: Number(heightText), fps: Number(fpsText)}
        if (tempoDirty) {
            patch.tempo = {bpm: Number(bpmField.text), offsetMs: Number(offsetField.text),
                timeSignature: {beatsPerBar: Number(beatsField.text), beatUnit: [2, 4, 8, 16][beatUnit.currentIndex]}}
        }
        if (timeline.applyEdit("setProjectSettings", patch)) close()
    }
    component TimelineListButton: Controls.Button {
        id: button
        property bool primary: false
        property bool destructive: false
        property string iconPath: ""
        property string accessibleLabel: text
        implicitHeight: 28 // CONTROL.height.sm
        implicitWidth: iconPath ? 28 : label.implicitWidth + 24
        padding: Theme.spacingSm
        hoverEnabled: true
        Accessible.name: accessibleLabel
        contentItem: Item {
            implicitWidth: label.implicitWidth
            Text {
                id: label
                anchors.centerIn: parent
                visible: !button.iconPath
                text: button.text
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Font.Medium
                color: button.enabled ? Theme.textPrimary : Theme.textDisabled
            }
            Icon {
                anchors.centerIn: parent
                visible: !!button.iconPath
                size: Theme.iconSm
                path: button.iconPath
                color: button.enabled ? Theme.textSecondary : Theme.textDisabled
            }
        }
        background: Rectangle {
            radius: Theme.radiusMd
            color: !button.enabled ? Theme.actionSelected : button.primary ?
                (button.destructive ? Theme.error : Theme.primary) : button.hovered ? Theme.actionHover : "transparent"
            border.width: button.activeFocus ? 2 : 0
            border.color: Theme.primary
        }
        Controls.ToolTip.visible: hovered && !!iconPath
        Controls.ToolTip.text: accessibleLabel
    }

    component TimelineListDialog: FocusScope {
        id: dialog
        property bool opened: false
        property string title: ""
        property string confirmText: "Apply"
        property bool confirmEnabled: true
        property bool destructive: false
        property bool busy: false
        property alias content: body.data
        signal confirmed()
        signal cancelled()
        visible: opened
        onOpenedChanged: { if (opened) forceActiveFocus() }
        Keys.onEscapePressed: cancelled()
        Rectangle {
            anchors.fill: parent
            color: Theme.scrim
            MouseArea { anchors.fill: parent; onClicked: dialog.cancelled() }
        }
        Rectangle {
            id: paper
            objectName: "dialogPaper"
            anchors.centerIn: parent
            // Dialog maxWidth="xs" (MUI xs=444), min(400px, 100vw - 32px).
            width: Math.min(444, Math.max(0, dialog.width - 32))
            height: Math.min(dialog.height - 64, header.height + scroller.contentHeight + actions.height)
            radius: 20 // theme.rounded.dialog
            color: Theme.backgroundPaper
            border.color: Theme.divider
            border.width: 1
            MouseArea { anchors.fill: parent } // stop backdrop clicks at the paper
            Item {
                id: header
                objectName: "dialogHeader"
                width: parent.width
                height: 52 // title line (24) + DialogStyles paddingBlock (12 + 12), border
                Text {
                    x: 24
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - 80
                    text: dialog.title
                    elide: Text.ElideRight
                    color: Theme.textPrimary
                    font.family: Theme.sansFamily
                    font.pixelSize: 18
                    font.weight: Font.DemiBold
                }
                TimelineListButton {
                    anchors.right: parent.right
                    anchors.rightMargin: 24
                    anchors.verticalCenter: parent.verticalCenter
                    iconPath: Icons.close
                    accessibleLabel: "Close"
                    onClicked: dialog.cancelled()
                }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.divider }
            }
            Controls.ScrollView {
                id: scroller
                x: 0
                y: header.height
                width: parent.width
                height: parent.height - header.height - actions.height
                contentWidth: availableWidth
                contentHeight: body.implicitHeight + 32
                clip: true
                Controls.ScrollBar.horizontal.policy: Controls.ScrollBar.AlwaysOff
                Column {
                    id: body
                    objectName: "dialogContent"
                    x: 24
                    y: Theme.spacingXl
                    width: scroller.availableWidth - 48
                }
            }
            Row {
                id: actions
                objectName: "dialogActions"
                anchors.right: parent.right
                anchors.rightMargin: 24
                anchors.bottom: parent.bottom
                height: 52 // 28px controls + DialogStyles 12px padding top and bottom
                spacing: Theme.spacingMd
                TimelineListButton {
                    objectName: "cancelSettings"
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Cancel"
                    enabled: !dialog.busy
                    onClicked: dialog.cancelled()
                }
                TimelineListButton {
                    objectName: "applySettings"
                    anchors.verticalCenter: parent.verticalCenter
                    text: dialog.confirmText
                    primary: true
                    destructive: dialog.destructive
                    enabled: dialog.confirmEnabled && !dialog.busy
                    onClicked: dialog.confirmed()
                }
            }
        }
    }
    ProjectSettingsValues { id: values }
    component SectionLabel: Text {
        color: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmaller
        font.letterSpacing: 0.66 // EYEBROW 0.06em
        font.capitalization: Font.AllUppercase
        height: 16
    }
    component NumberField: Column {
        id: field
        property string label: ""
        property alias text: input.text
        property real minimum: 0
        property real maximum: 7680
        property bool integer: true
        property int step: 1
        property string errorMessage: minimum + "–" + maximum
        readonly property bool valid: root.validNumber(text, minimum, maximum) && (!integer || Number.isInteger(Number(text)))
        spacing: Theme.spacingXs
        Text {
            text: field.label
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
            height: 18
        }
        Controls.TextField {
            id: input
            width: parent.width
            height: 36 // NumberField default density CONTROL.height.lg
            leftPadding: Theme.spacingMd
            rightPadding: Theme.spacingMd
            color: Theme.textPrimary
            selectionColor: Theme.primary
            selectedTextColor: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeNormal
            selectByMouse: true
            Accessible.name: field.label
            inputMethodHints: Qt.ImhFormattedNumbersOnly
            background: Rectangle {
                color: Theme.overlay
                radius: Theme.radiusSm
                border.width: 1
                border.color: !field.valid && input.text !== "" ? Theme.error : input.activeFocus ? Theme.primary : Theme.divider
            }
            Keys.onUpPressed: text = String(Math.min(field.maximum, (Number(text) || 0) + field.step))
            Keys.onDownPressed: text = String(Math.max(field.minimum, (Number(text) || 0) - field.step))
        }
        Text {
            visible: !field.valid && input.text !== ""
            text: field.errorMessage
            color: Theme.error
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
        }
    }
    component SelectField: Controls.ComboBox {
        id: select
        implicitHeight: 36
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeNormal
        Accessible.name: objectName === "resolutionPreset" ? "Canvas preset" : "Frame rate preset"
        contentItem: Text {
            leftPadding: Theme.spacingMd
            rightPadding: 24
            text: select.displayText
            color: Theme.textPrimary
            font: select.font
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        background: Rectangle {
            color: Theme.overlay
            radius: Theme.radiusMd
            border.width: 1
            border.color: select.activeFocus ? Theme.primary : Theme.divider
        }
    }
    TimelineListDialog {
        id: dialog
        anchors.fill: parent
        title: "Project settings"
        confirmEnabled: root.allValid && (root.canvasDirty || root.tempoDirty)
        onConfirmed: root.commit()
        onCancelled: root.close()
        content: Column {
            width: parent.width
            spacing: Theme.spacingXl
            Column {
                width: parent.width
                spacing: Theme.spacingMd
                SectionLabel { objectName: "canvasSizeLabel"; text: "CANVAS SIZE" }
                Column {
                    width: parent.width
                    spacing: Theme.spacingLg
                    SelectField {
                        id: resolution
                        objectName: "resolutionPreset"
                        width: parent.width
                        readonly property var sizes: [[1920,1080], [1280,720], [3840,2160], [1080,1920], [1080,1080], [1080,1350]]
                        model: ["1080p — 1920 × 1080 (16:9)", "720p — 1280 × 720 (16:9)", "4K UHD — 3840 × 2160 (16:9)",
                            "Vertical — 1080 × 1920 (9:16)", "Square — 1080 × 1080 (1:1)", "Portrait — 1080 × 1350 (4:5)", "Custom…"]
                        currentIndex: {
                            for (let i = 0; i < sizes.length; ++i) {
                                if (Number(root.widthText) === sizes[i][0] && Number(root.heightText) === sizes[i][1]) return i
                            }
                            return 6
                        }
                        onActivated: {
                            if (currentIndex < sizes.length) {
                                root.widthText = String(sizes[currentIndex][0])
                                root.heightText = String(sizes[currentIndex][1])
                            }
                        }
                    }
                    Row {
                        width: parent.width
                        spacing: Theme.spacingLg
                        NumberField { id: widthField; objectName: "widthField"; label: "Width"; minimum: 16; maximum: 7680; step: 2; width: (parent.width - parent.spacing) / 2 }
                        NumberField { id: heightField; objectName: "heightField"; label: "Height"; minimum: 16; maximum: 7680; step: 2; width: (parent.width - parent.spacing) / 2 }
                    }
                }
            }
            Column {
                width: parent.width
                spacing: Theme.spacingMd
                SectionLabel { objectName: "frameRateLabel"; text: "FRAME RATE" }
                Row {
                    width: parent.width
                    spacing: Theme.spacingLg
                    SelectField {
                        objectName: "frameRatePreset"
                        width: (parent.width - parent.spacing) * 2 / 3
                        model: ["24 fps", "25 fps", "30 fps", "50 fps", "60 fps", "Custom…"]
                        currentIndex: {
                            const i = [24, 25, 30, 50, 60].indexOf(Number(root.fpsText))
                            return i < 0 ? 5 : i
                        }
                        onActivated: { if (currentIndex < 5) root.fpsText = String([24,25,30,50,60][currentIndex]) }
                    }
                    NumberField { id: fpsField; objectName: "fpsField"; label: "FPS"; minimum: 1; maximum: 240; width: (parent.width - parent.spacing) / 3 }
                }
            }
            Column {
                width: parent.width
                spacing: Theme.spacingMd
                SectionLabel { objectName: "tempoLabel"; text: "TEMPO" }
                Column {
                    width: parent.width
                    spacing: Theme.spacingLg
                    Row {
                        width: parent.width
                        spacing: Theme.spacingLg
                        NumberField { id: bpmField; objectName: "bpmField"; label: "BPM"; integer: false; minimum: 20; maximum: 300; width: (parent.width - 2 * parent.spacing) / 3 }
                        NumberField { id: beatsField; objectName: "beatsField"; label: "Beats per bar"; minimum: 1; maximum: 16; width: (parent.width - 2 * parent.spacing) / 3 }
                        Column {
                            objectName: "beatUnitField"
                            width: (parent.width - 2 * parent.spacing) / 3
                            spacing: Theme.spacingXs
                            Text { text: "Beat unit"; color: Theme.textPrimary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium; height: 18 }
                            SelectField { id: beatUnit; width: parent.width; model: ["/ 2", "/ 4", "/ 8", "/ 16"]; Accessible.name: "Beat unit" }
                        }
                    }
                    NumberField { id: offsetField; objectName: "offsetField"; label: "Beat one at"; errorMessage: "0 or more"; integer: false; minimum: 0; maximum: Infinity; width: Math.min(220, parent.width) }
                }
            }
            Text {
                width: parent.width
                text: "Applies to the preview and the exported video. Existing clips keep their own source resolution and are scaled to fit the canvas."
                wrapMode: Text.WordWrap
                color: Theme.textSecondary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmaller
                lineHeight: 1.4
            }
        }
    }
}
