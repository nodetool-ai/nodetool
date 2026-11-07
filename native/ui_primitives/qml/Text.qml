import QtQuick
Text {
    id: root
    enum Tone { Primary, Secondary, Disabled, OnAccent, Success, Warning, Error, Info }
    property int role: Typography.SansBody
    property int tone: 0
    property var domainColor: undefined
    onRoleChanged: if (role < Typography.SansTitle || role > Typography.MonoCaption) { console.warn("Invalid text role"); role = Typography.SansBody }
    onToneChanged: if (tone < 0 || tone > 7) { console.warn("Invalid text tone"); tone = 0 }
    font.family: Typography.family(role)
    font.pixelSize: Typography.pixelSize(role)
    font.weight: Typography.weight(role)
    lineHeightMode: Text.ProportionalHeight
    lineHeight: Typography.lineHeight(role)
    // A proportional line height puts all its extra space under the glyphs. Moving the text down by
    // half of that space, and the bottom edge up by the same amount, centers the glyphs in the line
    // as CSS half-leading does, without changing the implicit size.
    // Qt already centers the glyphs when verticalAlignment is not AlignTop, so only top-aligned text moves.
    // Rich text is laid out by QTextDocument, which ignores lineHeight, so it has no extra space to shift.
    readonly property real halfLeading: lineHeightMode === Text.ProportionalHeight && verticalAlignment === Text.AlignTop && textFormat !== Text.RichText ? Math.round((lineHeight - 1) * Typography.naturalHeight(role) / 2) : 0
    topPadding: halfLeading
    bottomPadding: -halfLeading
    color: domainColor !== undefined ? domainColor : tone === 1 ? Theme.textSecondary : tone === 2 ? Theme.textDisabled :
           tone === 3 ? Theme.textOnAccent : tone === 4 ? Theme.statusSuccess :
           tone === 5 ? Theme.statusWarning : tone === 6 ? Theme.statusError :
           tone === 7 ? Theme.statusInfo : Theme.textPrimary
}
