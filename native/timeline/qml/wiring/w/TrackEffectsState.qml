pragma Singleton
import QtQuick
QtObject {
    property bool parameterGesture: false
    property string expandedFxTrackId: ""
    function toggleExpandedFx(trackId) {
        expandedFxTrackId = expandedFxTrackId === trackId ? "" : trackId
    }
}
