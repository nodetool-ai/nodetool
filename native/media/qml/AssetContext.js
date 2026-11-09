.pragma library

function itemNamed(item, name) {
    if (!item) return null
    if (item.objectName === name) return item
    // data includes popups, such as dialogs, which children leaves out.
    const children = item.data || []
    for (let i = 0; i < children.length; ++i) {
        const found = itemNamed(children[i], name)
        if (found) return found
    }
    return null
}

// A thumbnail decodes at a fixed bucket of device pixels, so a resize or a
// column change keeps the decoded pixmap in the image cache.
function thumbSize(width, height, devicePixelRatio) {
    const pixels = Math.max(width, height) * (devicePixelRatio > 0 ? devicePixelRatio : 1)
    const bucket = Math.max(128, Math.ceil(pixels / 128) * 128)
    return Qt.size(bucket, bucket)
}
