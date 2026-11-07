import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "ProjectSettingsDialog"
    implicitWidth: settingsButton.implicitWidth
    implicitHeight: settingsButton.implicitHeight
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
    property int beatUnitValue: 4
    readonly property bool allValid: validInteger(widthText, 16, 7680) && validInteger(heightText, 16, 7680)
        && validInteger(fpsText, 1, 240) && validNumber(bpmField.text, 20, 300)
        && validInteger(beatsField.text, 1, 16) && offsetField.text.trim() !== ""
        && Number.isFinite(Number(offsetField.text)) && Number(offsetField.text) >= 0
    readonly property bool canvasDirty: timeline && (Number(widthText) !== timeline.canvasWidth
        || Number(heightText) !== timeline.canvasHeight || Number(fpsText) !== timeline.fps)
    readonly property bool tempoDirty: Number(bpmField.text) !== initialTempo.bpm
        || Number(beatsField.text) !== initialTempo.timeSignature.beatsPerBar
        || beatUnitValue !== initialTempo.timeSignature.beatUnit
        || Number(offsetField.text) !== initialTempo.offsetMs
    readonly property bool opened: settingsPopup.visible
    ToolButton {
        id: settingsButton
        objectName: "projectSettingsButton"
        label: "Project settings"
        iconName: "straighten"
        activeFocusOnTab: true
        onClicked: root.open()
    }
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
        beatUnitValue = initialTempo.timeSignature.beatUnit
        offsetField.text = String(initialTempo.offsetMs)
        widthField.synchronize()
        heightField.synchronize()
        fpsField.synchronize()
        bpmField.synchronize()
        beatsField.synchronize()
        offsetField.synchronize()
        settingsPopup.open()
    }
    function close() { settingsPopup.close() }
    function commit() {
        if (!timeline || !allValid || (!canvasDirty && !tempoDirty)) return
        let patch = {width: Number(widthText), height: Number(heightText), fps: Number(fpsText)}
        if (tempoDirty) {
            patch.tempo = {bpm: Number(bpmField.text), offsetMs: Number(offsetField.text),
                timeSignature: {beatsPerBar: Number(beatsField.text), beatUnit: beatUnitValue}}
        }
        if (timeline.applyEdit("setProjectSettings", patch)) close()
    }
    component TimelineListButton: Ui.EditorButton {
        property bool primary: false
        property bool destructive: false
        property string accessibleLabel: text
        density: Ui.EditorButton.Compact
        variant: destructive ? Ui.EditorButton.Destructive : primary ? Ui.EditorButton.Primary : Ui.EditorButton.Flat
        iconTone: destructive ? Ui.Text.OnAccent : Ui.Text.Secondary
        accessibleName: accessibleLabel
    }

    component TimelineListDialog: Ui.Dialog {
        id: dialog
        property string confirmText: "Apply"
        property bool confirmEnabled: true
        property bool destructive: false
        property bool busy: false
        property alias content: body.data
        signal confirmed()
        signal cancelled()
        width: parent ? Math.min(Ui.Metrics.dialogCompactWidth, parent.width - 2 * Ui.Metrics.dialogNarrowInset) : Ui.Metrics.dialogCompactWidth
        height: parent ? Math.min(parent.height - 2 * Ui.Metrics.dialogNarrowInset, Ui.Metrics.touch * 16) : Ui.Metrics.touch * 16
        background.objectName: "dialogPaper"
        header: Item {
            implicitHeight: Ui.Metrics.touch + Ui.Metrics.md
            Ui.Text {
                anchors.left: parent.left
                anchors.leftMargin: Ui.Metrics.xl
                anchors.right: closeButton.left
                anchors.verticalCenter: parent.verticalCenter
                text: dialog.title
                role: Ui.Typography.SansTitle
                elide: Text.ElideRight
            }
            Ui.ToolbarIconButton {
                id: closeButton
                anchors.right: parent.right
                anchors.rightMargin: Ui.Metrics.xl
                anchors.verticalCenter: parent.verticalCenter
                iconName: "close"
                accessibleName: "Close"
                onClicked: dialog.cancelled()
            }
            Ui.Separator { anchors.bottom: parent.bottom; width: parent.width }
        }
        contentItem: Controls.ScrollView {
            id: scroller
            clip: true
            contentWidth: availableWidth
            Controls.ScrollBar.horizontal.policy: Controls.ScrollBar.AlwaysOff
            Column {
                id: body
                objectName: "dialogContent"
                width: scroller.availableWidth
                spacing: Ui.Metrics.md
            }
        }
        footer: Row {
            spacing: Ui.Metrics.md
            layoutDirection: Qt.RightToLeft
            Ui.EditorButton {
                objectName: "applySettings"
                text: dialog.confirmText
                variant: dialog.destructive ? Ui.EditorButton.Destructive : Ui.EditorButton.Primary
                enabled: dialog.confirmEnabled && !dialog.busy
                onClicked: dialog.confirmed()
            }
            Ui.EditorButton {
                objectName: "cancelSettings"
                text: "Cancel"
                enabled: !dialog.busy
                onClicked: dialog.cancelled()
            }
        }
        onRejected: cancelled()
    }
    ProjectSettingsValues { id: values }
    component SectionLabel: Ui.Text {
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
        height: Ui.Metrics.iconSm
    }
    component NumberField: Column {
        id: field
        property string label: ""
        property alias text: input.text
        property real minimum: 0
        property real maximum: 7680
        property bool integer: true
        property real step: 1
        property string errorMessage: minimum + "–" + maximum
        readonly property bool valid: root.validNumber(field.text, field.minimum, field.maximum) && (!field.integer || Number.isInteger(Number(field.text)))
        spacing: Ui.Metrics.xs
        function synchronize() { if (valid) input.value = Number(text) }
        function updateError() {
            const filled = input.text !== ""
            errorLabel.visible = filled && (!root.validNumber(input.text, field.minimum, field.maximum)
                || field.integer && !Number.isInteger(Number(input.text)))
        }
        Ui.Text { text: field.label; role: Ui.Typography.SansLabel }
        Ui.NumberField {
            id: input
            width: parent.width
            density: Ui.EditorButton.Comfortable
            from: field.minimum
            to: field.maximum
            stepSize: field.step
            errorText: field.errorMessage
            accessibleName: field.label
            inputMethodHints: Qt.ImhFormattedNumbersOnly
            selectByMouse: true
            onValueCommitted: value => input.value = value
            onTextChanged: field.updateError()
        }
        Ui.Text {
            id: errorLabel
            visible: false
            text: field.errorMessage
            tone: Ui.Text.Error
            role: Ui.Typography.SansCaption
        }
        Component.onCompleted: updateError()
    }
    TimelineListDialog {
        id: settingsPopup
        returnFocusTo: settingsButton
        title: "Project settings"
        confirmEnabled: root.allValid && (root.canvasDirty || root.tempoDirty)
        onConfirmed: root.commit()
        onCancelled: root.close()
        content: Column {
                width: parent.width
                spacing: Ui.Metrics.xl
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.md
                    SectionLabel { objectName: "canvasSizeLabel"; text: "CANVAS SIZE" }
                    Column {
                        width: parent.width
                        spacing: Ui.Metrics.lg
                        Ui.Select {
                            id: resolution
                            objectName: "resolutionPreset"
                            width: parent.width
                            accessibleName: "Canvas preset"
                            readonly property var sizes: [[1920,1080], [1280,720], [3840,2160], [1080,1920], [1080,1080], [1080,1350]]
                            options: ["1080p — 1920 × 1080 (16:9)", "720p — 1280 × 720 (16:9)", "4K UHD — 3840 × 2160 (16:9)",
                                "Vertical — 1080 × 1920 (9:16)", "Square — 1080 × 1080 (1:1)", "Portrait — 1080 × 1350 (4:5)", "Custom…"].map((label, index) => ({label: label, value: index}))
                            value: {
                                for (let i = 0; i < sizes.length; ++i) {
                                    if (Number(root.widthText) === sizes[i][0] && Number(root.heightText) === sizes[i][1]) return i
                                }
                                return 6
                            }
                            onValueCommitted: index => {
                                if (index < sizes.length) {
                                    root.widthText = String(sizes[index][0])
                                    root.heightText = String(sizes[index][1])
                                    widthField.synchronize()
                                    heightField.synchronize()
                                }
                            }
                        }
                        Row {
                            width: parent.width
                            spacing: Ui.Metrics.lg
                            NumberField { id: widthField; objectName: "widthField"; label: "Width"; minimum: 16; maximum: 7680; step: 2; width: (parent.width - parent.spacing) / 2 }
                            NumberField { id: heightField; objectName: "heightField"; label: "Height"; minimum: 16; maximum: 7680; step: 2; width: (parent.width - parent.spacing) / 2 }
                        }
                    }
                }
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.md
                    SectionLabel { objectName: "frameRateLabel"; text: "FRAME RATE" }
                    Row {
                        width: parent.width
                        spacing: Ui.Metrics.lg
                        Ui.Select {
                            objectName: "frameRatePreset"
                            width: (parent.width - parent.spacing) * 2 / 3
                            accessibleName: "Frame rate preset"
                            options: ["24 fps", "25 fps", "30 fps", "50 fps", "60 fps", "Custom…"].map((label, index) => ({label: label, value: index}))
                            value: {
                                const i = [24, 25, 30, 50, 60].indexOf(Number(root.fpsText))
                                return i < 0 ? 5 : i
                            }
                            onValueCommitted: index => { if (index < 5) { root.fpsText = String([24,25,30,50,60][index]); fpsField.synchronize() } }
                        }
                        NumberField { id: fpsField; objectName: "fpsField"; label: "FPS"; minimum: 1; maximum: 240; width: (parent.width - parent.spacing) / 3 }
                    }
                }
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.md
                    SectionLabel { objectName: "tempoLabel"; text: "TEMPO" }
                    Column {
                        width: parent.width
                        spacing: Ui.Metrics.lg
                        Row {
                            width: parent.width
                            spacing: Ui.Metrics.lg
                            NumberField { id: bpmField; objectName: "bpmField"; label: "BPM"; integer: false; minimum: 20; maximum: 300; width: (parent.width - 2 * parent.spacing) / 3 }
                            NumberField { id: beatsField; objectName: "beatsField"; label: "Beats per bar"; minimum: 1; maximum: 16; width: (parent.width - 2 * parent.spacing) / 3 }
                            Column {
                                objectName: "beatUnitField"
                                width: (parent.width - 2 * parent.spacing) / 3
                                spacing: Ui.Metrics.xs
                                Ui.Text { text: "Beat unit"; role: Ui.Typography.SansLabel; height: Ui.Metrics.iconMd }
                                Ui.Select { id: beatUnit; width: parent.width; options: [2, 4, 8, 16].map(value => ({label: "/ " + value, value: value})); value: root.beatUnitValue; accessibleName: "Beat unit"; onValueCommitted: value => root.beatUnitValue = value }
                            }
                        }
                        NumberField { id: offsetField; objectName: "offsetField"; label: "Beat one at"; errorMessage: "0 or more"; integer: false; minimum: 0; maximum: Infinity; width: Math.min(Ui.Metrics.standard * 7, parent.width) }
                    }
                }
                Ui.Text {
                    width: parent.width
                    text: "Applies to the preview and the exported video. Existing clips keep their own source resolution and are scaled to fit the canvas."
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
            }
    }
}
