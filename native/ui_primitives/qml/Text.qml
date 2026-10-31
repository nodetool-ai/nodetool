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
    // Qt puts the extra line height under each line. Move half of it above,
    // so the glyphs sit on the vertical center of the text box.
    readonly property real halfLeading: (lineHeight - 1) * font.pixelSize * 0.5
    topPadding: halfLeading
    bottomPadding: -halfLeading
    color: domainColor !== undefined ? domainColor : tone === 1 ? Theme.textSecondary : tone === 2 ? Theme.textDisabled :
           tone === 3 ? Theme.textOnAccent : tone === 4 ? Theme.statusSuccess :
           tone === 5 ? Theme.statusWarning : tone === 6 ? Theme.statusError :
           tone === 7 ? Theme.statusInfo : Theme.textPrimary
}
