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
    function lineHeight(role) {
        return role === Typography.SansTitle ? 1.30 : role === Typography.SansBody ? 1.45 :
               role === Typography.SansLabel || role === Typography.MonoLabel ? 1.35 :
               role === Typography.MonoCode || role === Typography.MonoStrong ? 1.50 : 1.40
    }
}
