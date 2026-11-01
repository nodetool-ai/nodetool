// Mirrors ExportVideoDialog.tsx and the export progress row of
// TimelineEditor.tsx. src/export/ExportPanel.cpp registers it in the overlay slot.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
import QtCore
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "exportPanel"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    property alias controller: exportController
    property bool mp4Supported: exportController.mp4Supported
    property bool alphaAvailable: false
    property string format: "mp4"
    property bool alpha: false
    readonly property bool alphaEnabled: alphaAvailable && (format === "webm" || format === "png_sequence")
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
        wav: "The whole timeline's audio mixdown in stereo, uncompressed at 48 kHz. No video.",
        mp3: "The whole timeline's audio mixdown in stereo. No video."
    })
    readonly property var alphaNotes: ({
        mp4: "MP4 carries no alpha channel. Choose WebM or a PNG sequence.",
        webm: "Composites over a transparent ground and keeps the alpha channel.",
        png_sequence: "Every PNG keeps its alpha channel.",
        wav: "A WAV has no picture, so there is nothing to make transparent.",
        mp3: "An MP3 has no picture, so there is nothing to make transparent."
    })
    signal exportRequested(var options)
    property var pendingOptions: ({format: "mp4", alpha: false})

    function open() { exportController.open() }
    function confirmExport() {
        if (!alphaEnabled) alpha = false
        exportRequested({format: format, alpha: alpha})
        exportVideoDialog.close()
    }
    onFormatChanged: {
        if (format === "mp4" && !mp4Supported) format = "webm"
        if (!alphaEnabled) alpha = false
    }
    onMp4SupportedChanged: { if (!mp4Supported && format === "mp4") format = "webm" }
    onAlphaEnabledChanged: { if (!alphaEnabled) alpha = false }
    onAlphaChanged: { if (!alphaEnabled && alpha) alpha = false }
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
        onOpenRequested: exportVideoDialog.open()
    }
    FileDialog {
        id: saveFile
        title: "Export timeline"
        fileMode: FileDialog.SaveFile
        onAccepted: exportController.start(selectedFile.toString(), root.pendingOptions.format, root.pendingOptions.alpha)
    }
    Ui.Dialog {
        id: exportVideoDialog
        objectName: "exportVideoDialog"
        title: "Export timeline"
        modal: true
        width: Math.min(root.width || Ui.Metrics.dialogWidth, Ui.Metrics.dialogWidth)
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.lg
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
                text: root.formatNotes[root.format] + (root.mp4Supported ? "" : " This browser cannot write MP4, so it is turned off.")
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
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
        footer: Row {
            spacing: Ui.Metrics.md
            Ui.EditorButton { text: "Cancel"; onClicked: exportVideoDialog.close() }
            Ui.EditorButton { text: "Export"; variant: Ui.EditorButton.Primary; onClicked: root.confirmExport() }
        }
    }
    Rectangle {
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        visible: exportController.running || exportController.error.length > 0
        implicitHeight: progressColumn.implicitHeight + Ui.Metrics.lg * 2
        height: implicitHeight
        color: Ui.Theme.surfacePanel
        ColumnLayout {
            id: progressColumn
            anchors.fill: parent
            anchors.margins: Ui.Metrics.lg
            spacing: Ui.Metrics.sm
            RowLayout {
                Layout.fillWidth: true
                Ui.Text {
                    Layout.fillWidth: true
                    role: Ui.Typography.SansLabel
                    tone: exportController.error ? Ui.Text.Error : Ui.Text.Primary
                    text: exportController.error || (exportController.phase === "audio" ? "Mixing audio…"
                        : exportController.phase === "encoding" ? "Encoding frame " + exportController.frame + " / " + exportController.totalFrames
                        : exportController.phase === "finalizing" ? "Finalizing…" : "Preparing…")
                    wrapMode: Text.WordWrap
                }
                Ui.Text {
                    visible: exportController.running
                    text: Math.round(exportController.ratio * 100) + "%"
                    role: Ui.Typography.MonoLabel
                    tone: Ui.Text.Secondary
                }
                Ui.EditorButton { text: "Cancel"; visible: exportController.running; onClicked: exportController.cancel() }
            }
            Ui.Progress { Layout.fillWidth: true; visible: exportController.running; value: exportController.ratio; accessibleName: "Export progress" }
        }
    }
}
