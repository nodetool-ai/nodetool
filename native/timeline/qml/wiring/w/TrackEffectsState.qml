pragma Singleton
import QtQuick
QtObject {
    property bool parameterGesture: false
    property string expandedFxTrackId: ""
    property bool panelVisible: false
    function toggleExpandedFx(trackId) {
        expandedFxTrackId = expandedFxTrackId === trackId ? "" : trackId
    }
}
