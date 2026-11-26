pragma ComponentBehavior: Bound
import QtQuick
Column {
    // JSON data from the document, controller, or shared JavaScript API.
    property var effect: ({})
    property bool disabled: false
    signal preview(var patch)
    signal commit(var patch)
    signal editCanceled()
}
