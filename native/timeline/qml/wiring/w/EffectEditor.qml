import QtQuick
Column {
    property var effect: ({})
    property bool disabled: false
    signal preview(var patch)
    signal commit(var patch)
}
