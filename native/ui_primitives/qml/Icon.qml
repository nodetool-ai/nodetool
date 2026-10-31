import QtQuick
import NodeTool.UiPrimitives as Ui
Image {
    id: root
    property string name: ""
    property real size: Metrics.iconSm
    property int tone: Ui.Text.Secondary
    property var domainColor: undefined
    onToneChanged: if (tone < Ui.Text.Primary || tone > Ui.Text.Info) { console.warn("Invalid icon tone"); tone = Ui.Text.Secondary }
    readonly property color ink: domainColor !== undefined ? domainColor : tone === Ui.Text.Primary ? Theme.textPrimary :
        tone === Ui.Text.Disabled ? Theme.textDisabled : tone === Ui.Text.OnAccent ? Theme.textOnAccent :
        tone === Ui.Text.Success ? Theme.statusSuccess : tone === Ui.Text.Warning ? Theme.statusWarning :
        tone === Ui.Text.Error ? Theme.statusError : tone === Ui.Text.Info ? Theme.statusInfo : Theme.textSecondary
    readonly property string pathData: name && Icons[name] !== undefined ? Icons[name] : ""
    rotation: name === "flipVertical" ? 90 : 0
    width: size; height: size
    sourceSize: Qt.size(Math.ceil(size * Screen.devicePixelRatio), Math.ceil(size * Screen.devicePixelRatio))
    source: pathData === "" ? "" : "data:image/svg+xml;utf8," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path ' + (name.startsWith("tool") ? 'fill="none" stroke="rgb(' + Math.round(ink.r * 255) + ',' + Math.round(ink.g * 255) + ',' + Math.round(ink.b * 255) + ')" stroke-opacity="' + ink.a + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"' : 'fill="rgb(' + Math.round(ink.r * 255) + ',' + Math.round(ink.g * 255) + ',' + Math.round(ink.b * 255) + ')" fill-opacity="' + ink.a + '"') + ' d="' + pathData + '"/></svg>')
    Accessible.ignored: true
    onNameChanged: if (name && pathData === "") console.warn("Unknown native icon: " + name)
}
