.pragma library
var AUTOMATION_LANE_HEIGHT_PX = 56
var AUTOMATION_FOOTER_HEIGHT_PX = 40
function automationSectionHeightPx(track, shownTrackIds) {
    return shownTrackIds.includes(track.id) ? (track.automation || []).length * 56 + 40 : 0
}
