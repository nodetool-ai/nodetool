// Mirrors ExportVideoDialog.tsx, extended with a range, output settings,
// presets and a queue of exports. src/export/ExportPanel.cpp registers it in
// the overlay slot. The Export button asks for a file and queues the export,
// which captures the document at that moment and runs in the background.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
import QtCore
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "Inspector/primitives"

Item {
    id: root
    objectName: "exportPanel"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    // The playback clock holds the In and Out marks.
    property var playbackClock: typeof clock !== "undefined" ? clock : null
    property alias controller: exportController
    property alias queue: exportQueue
    property alias presets: exportPresets
    property bool mp4Supported: exportController.mp4Supported
    property bool alphaAvailable: false
    property string format: "mp4"
    property bool alpha: false
    property string presetId: "match"
    property string rangeMode: "all"
    property real customStartSec: 0
    property real customEndSec: 0
    property bool matchSize: true
    property int outWidth: 1920
    property int outHeight: 1080
    property bool matchRate: true
    property real outFps: 30
    property bool autoBitrate: true
    property int bitrateKbps: 8000
    property string scaleMode: "fit"
    property string notice: ""
    property string saveError: ""
    // Set while a preset is applied, so the field handlers do not look the preset up again.
    property bool applying: false

    readonly property bool alphaEnabled: alphaAvailable && (format === "webm" || format === "png_sequence")
    readonly property bool audioOnly: format === "wav" || format === "mp3"
    readonly property bool encodesVideo: format === "mp4" || format === "webm"
    readonly property real timelineFps: timelineModel ? timelineModel.fps : 30
    readonly property real totalMs: timelineModel ? Math.max(0, timelineModel.contentEndMs) : 0
    readonly property bool hasMarks: !!playbackClock && (playbackClock.rangeInMs >= 0 || playbackClock.rangeOutMs >= 0)
    readonly property real markInMs: playbackClock && playbackClock.rangeInMs >= 0 ? Math.min(playbackClock.rangeInMs, totalMs) : 0
    readonly property real markOutMs: playbackClock && playbackClock.rangeOutMs >= 0 ? Math.min(playbackClock.rangeOutMs, totalMs) : totalMs
    readonly property real rangeStartMs: rangeMode === "inout" ? markInMs
        : rangeMode === "custom" ? Math.min(Math.max(0, customStartSec * 1000), totalMs) : 0
    readonly property real rangeEndMs: rangeMode === "inout" ? markOutMs
        : rangeMode === "custom" ? Math.min(Math.max(0, customEndSec * 1000), totalMs) : totalMs
    readonly property bool rangeValid: rangeEndMs - rangeStartMs > 0
    readonly property real effectiveFps: !encodesVideo && format !== "png_sequence" ? timelineFps : (matchRate ? timelineFps : outFps)
    readonly property int rangeFrames: Math.max(1, Math.round((rangeEndMs - rangeStartMs) * effectiveFps / 1000))
    readonly property bool canExport: rangeValid
    readonly property string rangeSummary: {
        if (!rangeValid) return totalMs <= 0 ? "Add a clip before exporting." : "The end must come after the start."
        const from = TimelineFormat.playheadTimecode(rangeStartMs, timelineFps)
        const to = TimelineFormat.playheadTimecode(rangeEndMs, timelineFps)
        const length = TimelineFormat.clipDuration(rangeEndMs - rangeStartMs)
        return from + " to " + to + " · " + length + (audioOnly ? "" : " · " + rangeFrames + " frames")
    }
    readonly property var presetList: exportPresets.presets
    readonly property var currentPreset: presetId.length > 0 ? exportPresets.preset(presetId) : ({})
    readonly property var formatOptions: [
        { value: "mp4", label: "MP4 (H.264)", disabled: !mp4Supported },
        { value: "webm", label: "WebM (VP9)", disabled: false },
        { value: "png_sequence", label: "PNG sequence (.zip)", disabled: false },
        { value: "wav", label: "WAV audio (16-bit)", disabled: false },
        { value: "mp3", label: "MP3 audio (320 kbps)", disabled: false }
    ]
    readonly property var formatNotes: ({
        mp4: "Plays everywhere. No transparency.",
        webm: "VP9 video with Opus audio.",
        png_sequence: "One PNG per frame in a zip, with a manifest.json naming the rate and size. No audio.",
        wav: "The audio mixdown in stereo, uncompressed at 48 kHz. No video.",
        mp3: "The audio mixdown in stereo. No video."
    })
    readonly property var alphaNotes: ({
        mp4: "MP4 carries no alpha channel. Choose WebM or a PNG sequence.",
        webm: "Composites over a transparent ground and keeps the alpha channel.",
        png_sequence: "Every PNG keeps its alpha channel.",
        wav: "A WAV has no picture, so there is nothing to make transparent.",
        mp3: "An MP3 has no picture, so there is nothing to make transparent."
    })
    readonly property var rangeOptions: [
        { value: "all", label: "Entire timeline" },
        { value: "inout", label: "In to Out", enabled: hasMarks },
        { value: "custom", label: "Custom range" }
    ]
    readonly property var fpsOptions: [
        { value: String(24000 / 1001), label: "23.976 fps" }, { value: "24", label: "24 fps" },
        { value: "25", label: "25 fps" }, { value: String(30000 / 1001), label: "29.97 fps" },
        { value: "30", label: "30 fps" }, { value: "50", label: "50 fps" },
        { value: String(60000 / 1001), label: "59.94 fps" }, { value: "60", label: "60 fps" }
    ]
    readonly property var scaleOptions: [
        { value: "fit", label: "Fit, with black bars" },
        { value: "fill", label: "Fill, cropping the edges" }
    ]
    signal exportRequested(var options)
    property var pendingOptions: ({format: "mp4", alpha: false})

    function open() { exportController.open() }
    function openDialog() {
        const last = exportPresets.lastSettings
        applySettings(last)
        presetId = exportPresets.idForSettings(last)
        rangeMode = hasMarks ? "inout" : "all"
        customStartSec = rangeMode === "inout" ? markInMs / 1000 : 0
        customEndSec = rangeMode === "inout" ? markOutMs / 1000 : totalMs / 1000
        exportVideoDialog.open()
    }
    function applySettings(settings) {
        applying = true
        format = settings.format === "mp4" && !mp4Supported ? "webm" : (settings.format || "mp4")
        matchSize = !(settings.width > 0 && settings.height > 0)
        if (!matchSize) { outWidth = settings.width; outHeight = settings.height }
        matchRate = !(settings.fps > 0)
        if (!matchRate) outFps = settings.fps
        autoBitrate = !(settings.videoBitrateKbps > 0)
        if (!autoBitrate) bitrateKbps = settings.videoBitrateKbps
        scaleMode = settings.scaleMode === "fill" ? "fill" : "fit"
        applying = false
    }
    function applyPreset(id) {
        const preset = exportPresets.preset(id)
        if (!preset.id) return
        applySettings(exportPresets.settingsFor(id))
        presetId = id
    }
    function currentSettings() {
        const settings = { format: format, alpha: alpha, startMs: 0, endMs: -1, width: 0, height: 0, fps: 0,
            videoBitrateKbps: 0, scaleMode: audioOnly || matchSize ? "fit" : scaleMode }
        if (!audioOnly) {
            if (!matchSize) { settings.width = outWidth; settings.height = outHeight }
            if (!matchRate) settings.fps = outFps
        }
        if (encodesVideo && !autoBitrate) settings.videoBitrateKbps = bitrateKbps
        if (rangeMode !== "all") { settings.startMs = rangeStartMs; settings.endMs = rangeEndMs }
        return settings
    }
    // The preset that matches the fields, or "" for custom settings.
    function syncPreset() {
        if (applying) return
        presetId = exportPresets.idForSettings(currentSettings())
    }
    function defaultRange() {
        if (hasMarks && markOutMs - markInMs > 0) return { startMs: markInMs, endMs: markOutMs }
        return { startMs: 0, endMs: -1 }
    }
    function confirmExport() {
        if (!alphaEnabled) alpha = false
        const settings = currentSettings()
        exportPresets.lastSettings = settings
        if (presetId.length > 0) exportPresets.lastPresetId = presetId
        exportRequested(settings)
        exportVideoDialog.close()
    }
    // The document bar's button: the last settings over the marked range, if any.
    function quickExport() {
        const settings = Object.assign({}, exportPresets.lastSettings, defaultRange(), { alpha: false })
        if (settings.format === "mp4" && !mp4Supported) settings.format = "webm"
        exportRequested(settings)
    }
    readonly property string quickLabel: {
        const last = exportPresets.lastSettings
        const id = exportPresets.idForSettings(last)
        return id.length > 0 ? exportPresets.preset(id).name : (last.format || "mp4").toUpperCase()
    }
    onFormatChanged: {
        if (format === "mp4" && !mp4Supported) format = "webm"
        if (!alphaEnabled) alpha = false
        syncPreset()
    }
    onMp4SupportedChanged: { if (!mp4Supported && format === "mp4") format = "webm" }
    onAlphaEnabledChanged: { if (!alphaEnabled) alpha = false }
    onAlphaChanged: { if (!alphaEnabled && alpha) alpha = false }
    onMatchSizeChanged: syncPreset()
    onOutWidthChanged: syncPreset()
    onOutHeightChanged: syncPreset()
    onMatchRateChanged: syncPreset()
    onOutFpsChanged: syncPreset()
    onAutoBitrateChanged: syncPreset()
    onBitrateKbpsChanged: syncPreset()
    onScaleModeChanged: syncPreset()
    onExportRequested: options => {
        pendingOptions = options
        if (!timelineModel) return
        const extension = options.format === "png_sequence" ? "zip" : options.format
        let name = timelineModel.name.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "")
        if (!name) name = "timeline"
        saveFile.currentFile = StandardPaths.writableLocation(StandardPaths.DocumentsLocation) + "/" + name + "." + extension
        saveFile.open()
    }

    ExportController {
        id: exportController
        objectName: "exportController"
        timeline: root.timelineModel
        onOpenRequested: root.openDialog()
    }
    ExportQueue {
        id: exportQueue
        objectName: "exportQueue"
        timeline: root.timelineModel
    }
    ExportPresets {
        id: exportPresets
        objectName: "exportPresets"
    }
    FileDialog {
        id: saveFile
        objectName: "exportSaveDialog"
        title: "Export timeline"
        fileMode: FileDialog.SaveFile
        onAccepted: {
            const options = root.pendingOptions
            const match = exportPresets.preset(exportPresets.idForSettings(options))
            root.notice = ""
            if (exportQueue.enqueue(selectedFile.toString(), options, match.name || "") === "") {
                root.notice = exportQueue.lastError
            }
        }
    }
    Ui.Dialog {
        id: exportVideoDialog
        objectName: "exportVideoDialog"
        title: "Export timeline"
        modal: true
        width: Math.min(root.width || Ui.Metrics.dialogWidth, Ui.Metrics.dialogWidth)
        contentItem: Flickable {
            id: scroller
            implicitHeight: Math.min(form.implicitHeight, Math.max(Ui.Metrics.touch * 4, (root.height || Ui.Metrics.dialogWidth) - Ui.Metrics.xxxl * 4))
            contentWidth: width
            contentHeight: form.implicitHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                id: form
                width: scroller.width - Ui.Metrics.xl
                spacing: Ui.Metrics.lg
                Ui.Text { text: "Preset"; role: Ui.Typography.SansLabel }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.md
                    InspectorSelect {
                        id: presetSelect
                        objectName: "presetSelect"
                        Layout.fillWidth: true
                        label: "Preset"
                        value: root.presetId.length > 0 ? root.presetId : "custom"
                        // "Custom" stays in the list, so choosing a field never rebuilds it.
                        options: root.presetList.map(preset => ({label: preset.name, value: preset.id}))
                            .concat([{label: "Custom settings", value: "custom", enabled: false}])
                        onChange: value => root.applyPreset(value)
                    }
                    Ui.EditorButton {
                        objectName: "savePresetButton"
                        text: "Save as preset…"
                        density: Ui.EditorButton.Compact
                        onClicked: { root.saveError = ""; presetName.text = ""; savePresetDialog.open() }
                    }
                    Ui.EditorButton {
                        objectName: "deletePresetButton"
                        text: "Delete preset"
                        density: Ui.EditorButton.Compact
                        variant: Ui.EditorButton.Destructive
                        visible: !!root.currentPreset.id && !root.currentPreset.builtin
                        onClicked: {
                            exportPresets.removeUserPreset(root.presetId)
                            root.applyPreset("match")
                        }
                    }
                }
                Ui.Text {
                    Layout.fillWidth: true
                    text: root.presetId.length > 0 ? (root.currentPreset.description || "") : "Your own settings."
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Text { text: "Format"; role: Ui.Typography.SansLabel }
                InspectorSelect {
                    id: formatSelect
                    objectName: "formatSelect"
                    Layout.fillWidth: true
                    label: "Format"
                    value: root.format
                    options: root.formatOptions.map(option => ({label: option.label, value: option.value, enabled: !option.disabled}))
                    onChange: value => { if (value !== "mp4" || root.mp4Supported) root.format = value }
                }
                Ui.Text {
                    Layout.fillWidth: true
                    text: root.formatNotes[root.format] + (root.mp4Supported ? "" : " This computer cannot write MP4, so it is turned off.")
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Text { text: "Range"; role: Ui.Typography.SansLabel }
                InspectorSelect {
                    id: rangeSelect
                    objectName: "rangeSelect"
                    Layout.fillWidth: true
                    label: "Range"
                    value: root.rangeMode
                    options: root.rangeOptions
                    onChange: value => root.rangeMode = value
                }
                RowLayout {
                    Layout.fillWidth: true
                    visible: root.rangeMode === "custom"
                    spacing: Ui.Metrics.lg
                    InspectorRow {
                        Layout.fillWidth: true
                        label: "Start"
                        InspectorPillInput {
                            objectName: "customStart"
                            value: String(root.customStartSec)
                            unit: "s"
                            ariaLabel: "Start of the range, in seconds"
                            scrub: ({step: 1, min: 0, max: root.totalMs / 1000})
                            onCommit: next => root.customStartSec = Number(next)
                        }
                    }
                    InspectorRow {
                        Layout.fillWidth: true
                        label: "End"
                        InspectorPillInput {
                            objectName: "customEnd"
                            value: String(root.customEndSec)
                            unit: "s"
                            ariaLabel: "End of the range, in seconds"
                            scrub: ({step: 1, min: 0, max: root.totalMs / 1000})
                            onCommit: next => root.customEndSec = Number(next)
                        }
                    }
                }
                Ui.Text {
                    objectName: "rangeSummary"
                    Layout.fillWidth: true
                    text: root.rangeSummary
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: root.rangeValid ? Ui.Text.Secondary : Ui.Text.Error
                }
                Ui.Text { visible: !root.audioOnly; text: "Picture"; role: Ui.Typography.SansLabel }
                InspectorToggleRow {
                    objectName: "matchSizeSwitch"
                    Layout.fillWidth: true
                    visible: !root.audioOnly
                    label: root.timelineModel ? "Match timeline size (" + root.timelineModel.canvasWidth + " × " + root.timelineModel.canvasHeight + ")" : "Match timeline size"
                    checked: root.matchSize
                    onChange: next => {
                        if (!next && root.timelineModel) {
                            root.outWidth = root.timelineModel.canvasWidth
                            root.outHeight = root.timelineModel.canvasHeight
                        }
                        root.matchSize = next
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    visible: !root.audioOnly && !root.matchSize
                    spacing: Ui.Metrics.lg
                    InspectorRow {
                        Layout.fillWidth: true
                        label: "Width"
                        InspectorPillInput {
                            objectName: "outputWidth"
                            value: String(root.outWidth)
                            unit: "px"
                            ariaLabel: "Output width"
                            scrub: ({step: 2, min: 16, max: 8192})
                            onCommit: next => root.outWidth = Math.round(Number(next))
                        }
                    }
                    InspectorRow {
                        Layout.fillWidth: true
                        label: "Height"
                        InspectorPillInput {
                            objectName: "outputHeight"
                            value: String(root.outHeight)
                            unit: "px"
                            ariaLabel: "Output height"
                            scrub: ({step: 2, min: 16, max: 8192})
                            onCommit: next => root.outHeight = Math.round(Number(next))
                        }
                    }
                }
                Ui.Text { visible: !root.audioOnly && !root.matchSize; text: "When the shape differs"; role: Ui.Typography.SansLabel }
                InspectorSelect {
                    objectName: "scaleModeSelect"
                    Layout.fillWidth: true
                    visible: !root.audioOnly && !root.matchSize
                    label: "When the shape differs"
                    value: root.scaleMode
                    options: root.scaleOptions
                    onChange: value => root.scaleMode = value
                }
                InspectorToggleRow {
                    objectName: "matchRateSwitch"
                    Layout.fillWidth: true
                    visible: !root.audioOnly
                    label: "Match timeline frame rate (" + (Math.round(root.timelineFps * 1000) / 1000) + " fps)"
                    checked: root.matchRate
                    onChange: next => {
                        if (!next) root.outFps = Math.round(root.timelineFps * 1000) / 1000
                        root.matchRate = next
                    }
                }
                InspectorSelect {
                    objectName: "frameRateSelect"
                    Layout.fillWidth: true
                    visible: !root.audioOnly && !root.matchRate
                    label: "Frame rate"
                    value: String(root.outFps)
                    options: {
                        const items = root.fpsOptions.slice()
                        if (!items.some(option => Number(option.value) === root.outFps)) {
                            items.push({value: String(root.outFps), label: root.outFps + " fps"})
                        }
                        return items
                    }
                    onChange: value => root.outFps = Number(value)
                }
                InspectorToggleRow {
                    objectName: "autoBitrateSwitch"
                    Layout.fillWidth: true
                    visible: root.encodesVideo
                    label: "Automatic quality"
                    checked: root.autoBitrate
                    onChange: next => root.autoBitrate = next
                }
                InspectorRow {
                    Layout.fillWidth: true
                    visible: root.encodesVideo && !root.autoBitrate
                    label: "Bit rate"
                    InspectorPillInput {
                        objectName: "bitrateField"
                        value: String(root.bitrateKbps)
                        unit: "kbit/s"
                        ariaLabel: "Video bit rate"
                        scrub: ({step: 100, min: 100, max: 200000})
                        onCommit: next => root.bitrateKbps = Math.round(Number(next))
                    }
                }
                InspectorToggleRow {
                    objectName: "alphaSwitch"
                    Layout.fillWidth: true
                    label: "Export with transparency"
                    checked: root.alpha
                    disabled: !root.alphaEnabled
                    onChange: next => root.alpha = next
                }
                Ui.Text {
                    Layout.fillWidth: true
                    text: root.alphaNotes[root.format]
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
            }
        }
        footer: Item {
            implicitHeight: exportFooter.implicitHeight + exportVideoDialog.padding * 2
            RowLayout {
                id: exportFooter
                anchors.fill: parent
                anchors.margins: exportVideoDialog.padding
                spacing: Ui.Metrics.md
                Item { Layout.fillWidth: true }
                Ui.EditorButton { text: "Cancel"; onClicked: exportVideoDialog.close() }
                Ui.EditorButton {
                    objectName: "exportConfirmButton"
                    text: "Export"
                    variant: Ui.EditorButton.Primary
                    enabled: root.canExport
                    disabledReason: root.rangeSummary
                    onClicked: root.confirmExport()
                }
            }
        }
    }
    Ui.Dialog {
        id: savePresetDialog
        objectName: "savePresetDialog"
        title: "Save as preset"
        modal: true
        width: Math.min(root.width || Ui.Metrics.dialogCompactWidth, Ui.Metrics.dialogCompactWidth)
        onOpened: presetName.forceActiveFocus()
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.lg
            Ui.Text {
                Layout.fillWidth: true
                text: "Saves the format, size, frame rate and quality. The range is not part of a preset."
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Ui.TextField {
                id: presetName
                objectName: "presetNameField"
                Layout.fillWidth: true
                accessibleName: "Preset name"
                onValueCommitted: savePresetDialog.save()
            }
            Ui.Text {
                Layout.fillWidth: true
                visible: root.saveError.length > 0
                text: root.saveError
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Error
            }
        }
        function save() {
            const id = exportPresets.saveUserPreset(presetName.text, root.currentSettings())
            if (id === "") {
                root.saveError = presetName.text.trim() === "" ? "Enter a name for the preset." : "Choose another name. This one belongs to a built-in preset."
                return
            }
            root.presetId = id
            close()
        }
        footer: Item {
            implicitHeight: saveFooter.implicitHeight + savePresetDialog.padding * 2
            RowLayout {
                id: saveFooter
                anchors.fill: parent
                anchors.margins: savePresetDialog.padding
                spacing: Ui.Metrics.md
                Item { Layout.fillWidth: true }
                Ui.EditorButton { text: "Cancel"; onClicked: savePresetDialog.close() }
                Ui.EditorButton {
                    objectName: "savePresetConfirm"
                    text: "Save"
                    variant: Ui.EditorButton.Primary
                    onClicked: savePresetDialog.save()
                }
            }
        }
    }
    ExportQueueCard {
        id: queueCard
        anchors.top: parent.top
        anchors.topMargin: TimelineMetrics.documentBarHeight + Ui.Metrics.md
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.md
        width: Math.min(Ui.Metrics.dialogCompactWidth, root.width - Ui.Metrics.md * 2)
        queue: exportQueue
        notice: root.notice
        onNoticeDismissed: root.notice = ""
    }
}
