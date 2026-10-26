// TextArea from ClipTextStyleSection. Text prefix matches package I's owns pattern.
// The Inspector primitives have no multiline input.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

TextArea {
    id: root
    required property var editor
    property string value: ""
    property bool disabled: editor.locked
    property bool typing: false
    enabled: !disabled
    text: value
    wrapMode: TextEdit.Wrap
    selectByMouse: true
    implicitHeight: Math.max(Theme.controlXs * 3, contentHeight + topPadding + bottomPadding)
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    color: Theme.textPrimary
    selectionColor: Theme.primary
    padding: Theme.spacingMd
    Accessible.name: "Text content"
    background: Rectangle {
        color: Theme.backgroundDefault
        border.color: root.activeFocus ? Theme.primary : Theme.overlay
        radius: Theme.radiusSm
    }
    onActiveFocusChanged: {
        if (activeFocus) {
            typing = true;
            editor.begin();
        } else if (typing) {
            typing = false;
            editor.set("text", text);
        }
    }
    onTextChanged: if (activeFocus && typing)
        editor.set("text", text, true)
}
