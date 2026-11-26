.pragma library
// Entries for the instrument and effect menus: built-in devices first, then VST3 plug-ins.
// Each entry is {key, section, label, detail, kind, type, plugin}.

const BUILTIN = "Built-in"
const PLUGINS = "Plug-ins"

const INSTRUMENTS = [
    { type: "drum", label: "Drum Sampler", detail: "808 and UZU kits" },
    { type: "bass", label: "Analog Bass", detail: "Mono ladder bass" },
    { type: "wavetable", label: "Wavetable", detail: "WT-1 synth" },
    { type: "sampler", label: "Sampler", detail: "Multisample zones" },
    { type: "modal", label: "Modal", detail: "Mallets and percussion" },
    { type: "subtractive", label: "Subtractive", detail: "Default synth" }
]

function instrumentLabel(instrument) {
    const type = instrument && instrument.type ? instrument.type : "subtractive"
    if (type === "vst") return instrument.plugin && instrument.plugin.name ? instrument.plugin.name : "VST3 Instrument"
    for (const entry of INSTRUMENTS) {
        if (entry.type === type) return entry.label
    }
    return type
}

function pluginKey(plugin) {
    return String(plugin.uid || plugin.path || plugin.name || "").replace(/[^A-Za-z0-9_-]/g, "")
}

function pluginEntries(plugins, placeholderLabel) {
    const out = []
    const list = plugins || []
    for (let i = 0; i < list.length; ++i) {
        const plugin = list[i]
        out.push({ key: "vst-" + pluginKey(plugin), section: PLUGINS, label: plugin.name || "VST3",
                   detail: plugin.vendor || "", kind: "vst", type: "vst", plugin: plugin })
    }
    if (out.length === 0) {
        out.push({ key: "vst", section: PLUGINS, label: placeholderLabel, detail: "Choose the plug-in in the device",
                   kind: "vst", type: "vst", plugin: null })
    }
    return out
}

function instrumentEntries(vstInstruments) {
    const out = INSTRUMENTS.map(entry => ({ key: entry.type, section: BUILTIN, label: entry.label, detail: entry.detail,
                                            kind: "builtin", type: entry.type, plugin: null }))
    return out.concat(pluginEntries(vstInstruments, "VST3 Instrument"))
}

// `types` lists the built-in effect types, `labels` maps a type to its name, and `fableKinds`
// marks the FableSynth types. `vstEffects` is null for a list without plug-ins.
function effectEntries(types, labels, fableKinds, vstEffects) {
    const out = types.map(type => ({ key: type, section: BUILTIN, label: labels[type] || type, detail: "",
                                     kind: fableKinds.indexOf(type) >= 0 ? "fable" : "builtin",
                                     type: type, plugin: null }))
    return vstEffects === null ? out : out.concat(pluginEntries(vstEffects, "VST3 Plugin"))
}

// Filters by label, detail or section and inserts one header line before each section.
function filter(entries, query) {
    const q = String(query || "").trim().toLowerCase()
    const out = []
    let section = ""
    for (const entry of entries) {
        if (q !== "" && (entry.label + " " + entry.detail + " " + entry.section).toLowerCase().indexOf(q) < 0) continue
        if (entry.section !== section) {
            section = entry.section
            out.push({ key: "header-" + section, kind: "header", label: section, detail: "", section: section })
        }
        out.push(entry)
    }
    return out
}

function firstItem(lines) {
    for (const line of lines) {
        if (line.kind !== "header") return line
    }
    return null
}
