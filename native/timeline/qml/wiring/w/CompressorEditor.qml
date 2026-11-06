import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
EffectEditor {
    id: editor
    spacing: Ui.Metrics.md
    Row {
        width: parent.width; spacing: Ui.Metrics.md
        CompressorCurve {
            effect: editor.effect
            disabled: editor.disabled
            onPreview: patch => editor.preview(patch)
            onCommit: patch => editor.commit(patch)
            onEditCanceled: editor.editCanceled()
        }
        Grid {
            width: parent.width - 180 - Ui.Metrics.md
            columns: 2; spacing: Ui.Metrics.xs
            Repeater {
                model: ["thresholdDb", "ratio", "kneeDb", "attackMs"]
                delegate: Rectangle {
                    id: tile
                    required property string modelData
                    required property int index
                    width: (parent.width - Ui.Metrics.xs) / 2; height: Math.max(88, tileDetails.implicitHeight + Ui.Metrics.sm * 2)
                    radius: Ui.Metrics.micro; color: Ui.Theme.surfacePanel; border.width: Ui.Metrics.border; border.color: Ui.Theme.borderSubtle
                    Rectangle { visible: tile.index < 2; width: parent.width; height: 2; color: tile.index === 0 ? TimelineVisuals.chord : Ui.Theme.statusWarning }
                    Column {
                        id: tileDetails
                        x: Ui.Metrics.md; y: Ui.Metrics.xs; spacing: Ui.Metrics.xs
                        Ui.Text {
                            text: (tile.modelData === "ratio" ? TrackEffectsReference.data.strings.compressor.ratio : TrackEffectsReference.data.strings.parameters[tile.modelData]).toUpperCase()
                            tone: Ui.Text.Secondary; role: Ui.Typography.SansCaption
                        }
                        Ui.Text {
                            text: Number(editor.effect[tile.modelData]).toFixed(1) + (tile.modelData === "ratio" ? ":1" : tile.modelData === "attackMs" ? " ms" : " dB")
                            tone: Ui.Text.Primary; role: Ui.Typography.SansLabel
                        }
                    }
                }
            }
        }
    }
    KnobList {
        width: parent.width; effect: editor.effect; disabled: editor.disabled
        onPreview: patch => editor.preview(patch)
        onCommit: patch => editor.commit(patch)
            onEditCanceled: editor.editCanceled()
    }
    Ui.Text {
        id: hint
        text: TrackEffectsReference.data.strings.compressor.curveHint
        tone: Ui.Text.Secondary; role: Ui.Typography.SansCaption
        Ui.Tooltip { trigger: hint; visible: hintHover.hovered; text: TrackEffectsReference.data.strings.compressor.curveHelp }
        HoverHandler { id: hintHover }
    }
}
