.pragma library

var regions = ["left", "right", "bottom", "viewport"];
var workspaces = ["Editing", "Script", "Assistant", "Review"];
// Presets only this editor has, so they stay out of the port below. The web list
// above must match TIMELINE_WORKSPACES, which dock-conformance.mjs checks.
var nativeWorkspaces = ["Color", "Audio"];
var sidePanels = ["inspector", "shot", "instruments", "assistant", "history", "code"];
var requiredPanels = ["program", "tracks"];

// Field-for-field port of TimelineDockLayout.ts, checked by dock-conformance.mjs.
function createLayout(name) {
    var layout = createWebLayout(name);
    if (nativeWorkspaces.indexOf(name) >= 0) { applyNativePreset(layout, name); }
    return layout;
}
function workspaceNames() { return workspaces.concat(nativeWorkspaces); }
function webWorkspaceNames() { return workspaces; }
// A panel that is not built yet is simply not shown: the group falls back to its
// next panel, and an empty group takes no room. Listing the left panels makes
// them part of the preset, so they can be hidden. "color", "scopes" and "audio"
// are the ids of the panels the two workspaces are for.
function applyNativePreset(layout, name) {
    var leftPanels = ["transcript", "storyboard", "script", "entities", "assets"];
    var workArea = name === "Color" ? "scopes" : "mixer";
    var controls = name === "Color" ? "color" : "audio";
    layout.regions.left[0].panels = leftPanels;
    layout.regions.left[0].activePanelId = leftPanels[0];
    layout.regions.right[0].panels = [controls].concat(sidePanels);
    layout.regions.right[0].activePanelId = controls;
    layout.regions.viewport[1].panels = ["source", workArea];
    layout.regions.viewport[1].activePanelId = workArea;
    layout.sizes = {left: 320, right: 400, bottom: 280};
    layout.hidden = leftPanels.concat(["source"]);
}
// What a native preset hides is its own choice. Leaving it would hide those
// panels in the next workspace too, the first time that one opens.
function presetFromWorkspace(layout, from, name) {
    if (nativeWorkspaces.indexOf(from) < 0) { return presetWithExtensions(layout, name); }
    var next = clone(layout);
    var own = createLayout(from).hidden;
    next.hidden = next.hidden.filter(function(id) { return own.indexOf(id) < 0; });
    return presetWithExtensions(next, name);
}

function createWebLayout(name) {
    var layout = {
        version: 1,
        regions: {
            left: [{id: "left-main", panels: ["transcript", "storyboard"], activePanelId: "transcript"}],
            right: [{id: "right-main", panels: sidePanels.slice(), activePanelId: "inspector"}],
            bottom: [{id: "bottom-main", panels: ["tracks"], activePanelId: "tracks"}],
            viewport: [
                {id: "viewport-program", panels: ["program"], activePanelId: "program", weight: 1.6},
                {id: "viewport-source", panels: ["source"], activePanelId: "source", weight: 1}
            ]
        },
        hidden: [], sizes: {left: 320, right: 360, bottom: 300}
    };
    if (name === "Script") {
        layout.sizes = {left: 480, right: 320, bottom: 240};
        layout.hidden = ["source"];
    }
    if (name === "Assistant") {
        layout.regions.right[0].activePanelId = "assistant";
        layout.sizes = {left: 320, right: 520, bottom: 260};
        layout.hidden = ["transcript", "storyboard", "source"];
    }
    if (name === "Review") {
        layout.sizes = {left: 320, right: 360, bottom: 220};
        layout.hidden = ["transcript", "storyboard", "source"].concat(sidePanels);
    }
    return layout;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function allGroups(layout) {
    return regions.reduce(function(result, region) { return result.concat(layout.regions[region]); }, []);
}
function groupOfPanel(layout, id) {
    return allGroups(layout).find(function(group) { return group.panels.indexOf(id) >= 0; });
}
function regionOfGroup(layout, id) {
    return regions.find(function(region) {
        return layout.regions[region].some(function(group) { return group.id === id; });
    });
}
function exactKeys(value, keys, optional) {
    if (!value || typeof value !== "object" || Array.isArray(value)) { return false; }
    return keys.every(function(key) { return Object.prototype.hasOwnProperty.call(value, key); }) &&
        Object.keys(value).every(function(key) { return keys.indexOf(key) >= 0 || (optional || []).indexOf(key) >= 0; });
}
function panelId(value) { return typeof value === "string" && value.length > 0 && value.length <= 256; }
function numberIn(value, min, max) { return typeof value === "number" && isFinite(value) && value >= min && value <= max; }
function valid(layout) {
    if (!exactKeys(layout, ["version", "regions", "hidden", "sizes"]) || layout.version !== 1 ||
        !exactKeys(layout.regions, regions) || !exactKeys(layout.sizes, ["left", "right", "bottom"]) ||
        !numberIn(layout.sizes.left, 100, 1600) || !numberIn(layout.sizes.right, 100, 1600) ||
        !numberIn(layout.sizes.bottom, 80, 1000) || !Array.isArray(layout.hidden) || layout.hidden.length > 512) { return false; }
    var panels = new Set(), groups = new Set(), hidden = new Set();
    for (var r = 0; r < regions.length; ++r) {
        var entries = layout.regions[regions[r]];
        if (!Array.isArray(entries) || entries.length > 128) { return false; }
        for (var g = 0; g < entries.length; ++g) {
            var group = entries[g];
            if (!exactKeys(group, ["id", "panels", "activePanelId"], ["weight"]) || !panelId(group.id) ||
                groups.has(group.id) || !Array.isArray(group.panels) || group.panels.length < 1 || group.panels.length > 512 ||
                !panelId(group.activePanelId) || group.panels.indexOf(group.activePanelId) < 0 ||
                (group.weight !== undefined && !numberIn(group.weight, 0.05, 20))) { return false; }
            groups.add(group.id);
            for (var p = 0; p < group.panels.length; ++p) {
                var id = group.panels[p];
                if (!panelId(id) || panels.has(id)) { return false; }
                panels.add(id);
            }
        }
    }
    for (var h = 0; h < layout.hidden.length; ++h) {
        var hiddenId = layout.hidden[h];
        if (!panelId(hiddenId) || hidden.has(hiddenId)) { return false; }
        hidden.add(hiddenId);
    }
    return requiredPanels.every(function(id) { return panels.has(id) && !hidden.has(id); });
}
function checked(layout) {
    if (!valid(layout)) { throw new Error("Invalid timeline dock layout"); }
    return layout;
}
function hydrate(value) { return valid(value) ? clone(value) : createLayout(); }
function registerMissingPanels(layout, panels) {
    var next = clone(layout);
    var placed = new Set(allGroups(next).reduce(function(ids, group) { return ids.concat(group.panels); }, []));
    var ids = new Set(allGroups(next).map(function(group) { return group.id; }));
    var index = 0;
    panels.forEach(function(panel) {
        if (placed.has(panel.id)) { return; }
        var entries = next.regions[panel.defaultRegion];
        var id = panel.defaultRegion + "-extension-" + index;
        while (ids.has(id)) { ++index; id = panel.defaultRegion + "-extension-" + index; }
        ids.add(id);
        if (entries.length) { entries[0].panels.push(panel.id); }
        else { entries.push({id: id, panels: [panel.id], activePanelId: panel.id}); }
        placed.add(panel.id);
    });
    return checked(next);
}
function presetWithExtensions(layout, name) {
    var preset = createLayout(name);
    var builtIn = new Set(allGroups(preset).reduce(function(ids, group) { return ids.concat(group.panels); }, []));
    var groups = new Set(allGroups(preset).map(function(group) { return group.id; }));
    var index = 0;
    regions.forEach(function(region) {
        layout.regions[region].forEach(function(prior) {
            var panels = prior.panels.filter(function(id) { return !builtIn.has(id); });
            if (!panels.length) { return; }
            var target = preset.regions[region].find(function(group) { return group.id === prior.id; });
            if (target) { target.panels = target.panels.concat(panels); return; }
            var id = prior.id;
            while (groups.has(id)) { id = "preset-extension-" + index++; }
            groups.add(id);
            preset.regions[region].push({id: id, panels: panels,
                activePanelId: panels.indexOf(prior.activePanelId) >= 0 ? prior.activePanelId : panels[0]});
        });
    });
    preset.hidden = preset.hidden.concat(layout.hidden.filter(function(id) { return !builtIn.has(id); }));
    return checked(preset);
}
function applyTransition(layout, action) {
    if (action.type === "preset") { return presetWithExtensions(layout, action.name); }
    var next = clone(layout);
    if (action.type === "resize") { next.sizes[action.region] = action.size; return checked(next); }
    if (action.type === "resizeGroups") {
        next.regions[action.region].forEach(function(group) {
            if (action.weights[group.id] !== undefined) { group.weight = action.weights[group.id]; }
        });
        return checked(next);
    }
    var source = regions.find(function(region) {
        return next.regions[region].some(function(group) { return group.panels.indexOf(action.panelId) >= 0; });
    });
    if (!source) { throw new Error("Timeline panel " + action.panelId + " has no layout placement"); }
    if (action.type === "hide") {
        if (requiredPanels.indexOf(action.panelId) < 0 && next.hidden.indexOf(action.panelId) < 0) { next.hidden.push(action.panelId); }
        return next;
    }
    if (action.type === "activate" || action.type === "reveal") {
        groupOfPanel(next, action.panelId).activePanelId = action.panelId;
        if (action.type === "reveal") { next.hidden = next.hidden.filter(function(id) { return id !== action.panelId; }); }
        return next;
    }
    if (!Number.isInteger(action.index) || action.index < 0) { throw new Error("Invalid panel insertion index"); }
    var targetRegion = regionOfGroup(next, action.groupId);
    if (targetRegion && targetRegion !== action.region) { throw new Error("Dock group belongs to another region"); }
    var original = next.regions[action.region].find(function(group) { return group.id === action.groupId; });
    if (original && original.panels.length === 1 && original.panels[0] === action.panelId && action.index === 0) { return layout; }
    next.regions[source] = next.regions[source].filter(function(group) {
        group.panels = group.panels.filter(function(id) { return id !== action.panelId; });
        if (group.activePanelId === action.panelId) { group.activePanelId = group.panels[0]; }
        return group.panels.length > 0;
    });
    var target = next.regions[action.region].find(function(group) { return group.id === action.groupId; });
    if (action.index > (target ? target.panels.length : 0)) { throw new Error("Panel insertion index exceeds group length"); }
    if (target) {
        target.panels.splice(action.index, 0, action.panelId);
        target.activePanelId = action.panelId;
    } else {
        var entries = next.regions[action.region];
        var anchorIndex = action.anchor ? entries.findIndex(function(group) { return group.id === action.anchor.groupId; }) : -1;
        entries.splice(anchorIndex < 0 ? entries.length : anchorIndex + (action.anchor.side === "after" ? 1 : 0), 0,
            {id: action.groupId, panels: [action.panelId], activePanelId: action.panelId});
    }
    return checked(next);
}

function uniqueDockGroupId(layout, region) {
    var ids = new Set(allGroups(layout).map(function(group) { return group.id; }));
    var index = 0;
    while (ids.has(region + "-dock-" + index)) { ++index; }
    return region + "-dock-" + index;
}
function dockDropAction(layout, panelId, target, available) {
    if (target.kind === "region") {
        return {type: "move", panelId: panelId, region: target.region, groupId: uniqueDockGroupId(layout, target.region), index: 0};
    }
    var group = layout.regions[target.region].find(function(entry) { return entry.id === target.groupId; });
    if (!group) { return null; }
    var others = group.panels.filter(function(id) { return id !== panelId; });
    if (target.kind === "tab" || target.zone === "center") {
        if (target.kind !== "tab" && group.panels.indexOf(panelId) >= 0) { return null; }
        var shown = others.filter(function(id) { return available.indexOf(id) >= 0 && layout.hidden.indexOf(id) < 0; });
        var requested = target.kind === "tab" ? Math.max(0, Math.min(target.index, shown.length)) : shown.length;
        var before = shown[requested], after = shown[requested - 1];
        var index = before !== undefined ? others.indexOf(before) : after !== undefined ? others.indexOf(after) + 1 : others.length;
        if (group.panels.indexOf(panelId) === index && others.length === group.panels.length - 1) { return null; }
        return {type: "move", panelId: panelId, region: target.region, groupId: group.id, index: index};
    }
    if (!others.length) { return null; }
    return {type: "move", panelId: panelId, region: target.region, groupId: uniqueDockGroupId(layout, target.region), index: 0,
        anchor: {groupId: group.id, side: target.zone === "top" || target.zone === "left" ? "before" : "after"}};
}
function dockMoveToRegion(layout, panelId, region) {
    var first = layout.regions[region][0];
    if (!first) { return dockDropAction(layout, panelId, {kind: "region", region: region}, []); }
    return {type: "move", panelId: panelId, region: region, groupId: first.id,
        index: first.panels.filter(function(id) { return id !== panelId; }).length};
}

function sameIds(a, b) { return a.length === b.length && a.every(function(id, index) { return id === b[index]; }); }
function sameDockLayout(a, b) {
    return a === b || (a.version === b.version && sameIds(a.hidden, b.hidden) &&
        a.sizes.left === b.sizes.left && a.sizes.right === b.sizes.right && a.sizes.bottom === b.sizes.bottom &&
        regions.every(function(region) {
            return a.regions[region].length === b.regions[region].length && a.regions[region].every(function(group, index) {
                var other = b.regions[region][index];
                return group.id === other.id && group.activePanelId === other.activePanelId && group.weight === other.weight && sameIds(group.panels, other.panels);
            });
        }));
}
function transition(layout, action) {
    var next = applyTransition(layout, action);
    return sameDockLayout(layout, next) ? layout : next;
}
