.pragma library
// The editor that holds an item, found by its dock store: the music chrome
// shows only while that editor's layout is Music (docs/MUSIC-MODE.md section 15).

function editorOf(item) {
    for (let parent = item ? item.parent : null; parent; parent = parent.parent) {
        if (parent.dockStore !== undefined && parent.timeline !== undefined) return parent
    }
    return null
}
