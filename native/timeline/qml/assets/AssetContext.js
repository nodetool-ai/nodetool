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
    // data includes popups, such as dialogs, which children leaves out.
    const children = item.data || []
    for (let i = 0; i < children.length; ++i) {
        const found = itemNamed(children[i], name)
        if (found) return found
    }
    return null
}
