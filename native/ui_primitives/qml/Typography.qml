pragma Singleton
import QtQuick
QtObject {
    enum Role { SansTitle, SansBody, SansLabel, SansCaption, MonoCode, MonoStrong, MonoLabel, MonoCaption }
    readonly property FontLoader interRegular: FontLoader { source: "qrc:/qt/qml/NodeTool/UiPrimitives/fonts/inter-latin-400-normal.ttf" }
    readonly property FontLoader interMedium: FontLoader { source: "qrc:/qt/qml/NodeTool/UiPrimitives/fonts/inter-latin-500-normal.ttf" }
    readonly property FontLoader interSemibold: FontLoader { source: "qrc:/qt/qml/NodeTool/UiPrimitives/fonts/inter-latin-600-normal.ttf" }
    readonly property FontLoader monoRegular: FontLoader { source: "qrc:/qt/qml/NodeTool/UiPrimitives/fonts/jetbrains-mono-latin-400-normal.ttf" }
    readonly property FontLoader monoMedium: FontLoader { source: "qrc:/qt/qml/NodeTool/UiPrimitives/fonts/jetbrains-mono-latin-500-normal.ttf" }
    readonly property FontLoader monoSemibold: FontLoader { source: "qrc:/qt/qml/NodeTool/UiPrimitives/fonts/jetbrains-mono-latin-600-normal.ttf" }
    readonly property string sansFamily: interRegular.status === FontLoader.Ready ? interRegular.font.family : "sans-serif"
    readonly property string monoFamily: monoRegular.status === FontLoader.Ready ? monoRegular.font.family : "monospace"
    function family(role) { return role >= Typography.MonoCode ? monoFamily : sansFamily }
    function pixelSize(role) {
        const base = role === Typography.SansTitle ? 18 : role === Typography.SansBody ? 15 :
                     (role === Typography.SansCaption || role === Typography.MonoCaption ? 11 : 13)
        return base * Theme.uiScale * Theme.textScale
    }
    function weight(role) {
        return role === Typography.SansTitle || role === Typography.MonoStrong ? Font.DemiBold :
               role === Typography.SansLabel || role === Typography.MonoLabel ? Font.Medium : Font.Normal
    }
    function font(role) {
        if (!Number.isInteger(role) || role < Typography.SansTitle || role > Typography.MonoCaption) {
            console.warn("Invalid typography role")
            role = Typography.SansBody
        }
        return Qt.font({ family: family(role), pixelSize: pixelSize(role), weight: weight(role) })
    }
    function canvasFont(role) {
        const selected = font(role)
        const cssWeight = selected.weight === Font.DemiBold ? 600 :
                          selected.weight === Font.Medium ? 500 : 400
        return cssWeight + " " + selected.pixelSize + 'px "' + selected.family + '"'
    }
    // One FontMetrics per role, shared by every Text, gives the natural line height that half-leading is split from.
    readonly property FontMetrics metricsTitle: FontMetrics { font: Typography.font(Typography.SansTitle) }
    readonly property FontMetrics metricsBody: FontMetrics { font: Typography.font(Typography.SansBody) }
    readonly property FontMetrics metricsLabel: FontMetrics { font: Typography.font(Typography.SansLabel) }
    readonly property FontMetrics metricsCaption: FontMetrics { font: Typography.font(Typography.SansCaption) }
    readonly property FontMetrics metricsCode: FontMetrics { font: Typography.font(Typography.MonoCode) }
    readonly property FontMetrics metricsStrong: FontMetrics { font: Typography.font(Typography.MonoStrong) }
    readonly property FontMetrics metricsMonoLabel: FontMetrics { font: Typography.font(Typography.MonoLabel) }
    readonly property FontMetrics metricsMonoCaption: FontMetrics { font: Typography.font(Typography.MonoCaption) }
    // Qt's text layout rounds a line up to whole pixels before it applies a proportional line height, so this does too.
    function naturalHeight(role) {
        const metrics = [metricsTitle, metricsBody, metricsLabel, metricsCaption, metricsCode, metricsStrong, metricsMonoLabel, metricsMonoCaption]
        return metrics[role] ? Math.ceil(metrics[role].height) : 0
    }
    function lineHeight(role) {
        return role === Typography.SansTitle ? 1.30 : role === Typography.SansBody ? 1.45 :
               role === Typography.SansLabel || role === Typography.MonoLabel ? 1.35 :
               role === Typography.MonoCode || role === Typography.MonoStrong ? 1.50 : 1.40
    }
}
