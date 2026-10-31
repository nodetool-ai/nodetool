.pragma library

function editorFor(item) {
    for (let parent = item.parent; parent; parent = parent.parent) {
        if (parent.timeline !== undefined && parent.clock !== undefined) return parent
    }
    return null
}

function itemNamed(item, name) {
    if (!item) return null
    if (item.objectName === name) return item
    const children = item.children || []
    for (let i = 0; i < children.length; ++i) {
        const found = itemNamed(children[i], name)
        if (found) return found
    }
    return null
}
