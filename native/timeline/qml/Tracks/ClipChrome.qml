pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

ClipChromeLayer {
    required property ClipBody clipBody
    detail: clipBody
    ink: TimelineVisuals.clipText
    fxFill: TimelineVisuals.fxBadge
    fxInk: TimelineVisuals.overlayContrast
    nameStyle: Ui.Typography.metricsCaption
    durationStyle: Ui.Typography.metricsMonoCaption
    bandHeight: TimelineMetrics.clipNameBandHeight
    small: Ui.Metrics.xs
    medium: Ui.Metrics.md
    micro: Ui.Metrics.micro
}
