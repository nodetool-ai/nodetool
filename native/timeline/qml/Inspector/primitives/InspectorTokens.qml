pragma Singleton
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
QtObject {
    readonly property int controlSm: Ui.Metrics.small + Ui.Metrics.xs
    readonly property int controlMd: Ui.Metrics.small + Ui.Metrics.md
    readonly property int controlXl: Ui.Metrics.small + Ui.Metrics.xl + Ui.Metrics.xs
    readonly property int rowControlMinWidth: 112
    readonly property int staticValueMaxWidth: 160
    readonly property int sectionIndent: Ui.Metrics.xl * 2
    // The slider rows' label and value columns, so the tracks line up.
    readonly property int sliderLabelWidth: 88
    readonly property int sliderValueWidth: 44
}
