import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
EffectEditor {
    id: editor
    spacing: Theme.spacingMd
    Row {
        width: parent.width; spacing: Theme.spacingMd
        CompressorCurve {
            effect: editor.effect
            disabled: editor.disabled
            onPreview: patch => editor.preview(patch)
            onCommit: patch => editor.commit(patch)
        }
        Grid {
            width: parent.width - 180 - Theme.spacingMd
            columns: 2; spacing: Theme.spacingXs
            Repeater {
                model: ["thresholdDb", "ratio", "kneeDb", "attackMs"]
                delegate: Rectangle {
                    id: tile
                    required property string modelData
                    required property int index
                    width: (parent.width - Theme.spacingXs) / 2; height: 88
                    radius: Theme.radiusXs; color: Theme.backgroundPaper; border.width: 1; border.color: Theme.divider
                    Rectangle { visible: tile.index < 2; width: parent.width; height: 2; color: tile.index === 0 ? Theme.warningLight : Theme.warning }
                    Column {
                        x: Theme.spacingMd; y: Theme.spacingXs; spacing: Theme.spacingXs
                        Text {
                            text: (tile.modelData === "ratio" ? TrackEffectsReference.data.strings.compressor.ratio : TrackEffectsReference.data.strings.parameters[tile.modelData]).toUpperCase()
                            color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller
                        }
                        Text {
                            text: Number(editor.effect[tile.modelData]).toFixed(1) + (tile.modelData === "ratio" ? ":1" : tile.modelData === "attackMs" ? " ms" : " dB")
                            color: Theme.textPrimary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium
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
    }
    Text {
        text: TrackEffectsReference.data.strings.compressor.curveHint
        color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller
        ToolTip.visible: hintHover.hovered; ToolTip.delay: 500; ToolTip.text: TrackEffectsReference.data.strings.compressor.curveHelp
        HoverHandler { id: hintHover }
    }
}
