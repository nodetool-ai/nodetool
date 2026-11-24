#include "audio/vst/PluginAssistant.h"
#include <QJsonArray>
#include <QUuid>
#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>

namespace nt::audio::vst {
namespace {
constexpr std::array names{"list_plugins",         "load_plugin",           "list_plugin_presets",
                           "select_plugin_preset", "get_plugin_parameters", "set_plugin_parameters"};
QString operation(QString name) { return name.remove(QStringLiteral("ui_timeline_")); }
void require(bool condition, const char *message) {
    if (!condition) {
        throw std::runtime_error(message);
    }
}
int uniqueMatch(const QJsonArray &entries, const QJsonValue &ref, const QStringList &fields) {
    if (ref.isDouble()) {
        const double n = ref.toDouble();
        require(std::isfinite(n) && n >= 0 && n < entries.size() && std::floor(n) == n, "Index is out of range.");
        return static_cast<int>(n);
    }
    require(ref.isString() && !ref.toString().trimmed().isEmpty(), "Pass an id, index or name.");
    const auto text = ref.toString().trimmed();
    // Exact ids take precedence over names and prefixes.
    for (qsizetype i = 0; i < entries.size(); ++i) {
        if (entries[i].toObject().value("id").toString() == text) {
            return static_cast<int>(i);
        }
    }
    int found = -1;
    for (qsizetype i = 0; i < entries.size(); ++i) {
        const auto entry = entries[i].toObject();
        bool match = false;
        for (const auto &field : fields) {
            match |= entry.value(field).toString().compare(text, Qt::CaseInsensitive) == 0;
        }
        const auto id = entry.value("id").toString();
        const bool hex = text.size() == 12 && std::ranges::all_of(text, [](QChar c) {
                             return (c >= u'0' && c <= u'9') || (c >= u'a' && c <= u'f');
                         });
        match |= hex && id.startsWith(text);
        if (match) {
            require(found < 0, "Ambiguous reference. Pass the full id or index.");
            found = static_cast<int>(i);
        }
    }
    if (found < 0 && std::ranges::all_of(text, [](QChar c) { return c >= u'0' && c <= u'9'; })) {
        bool ok = false;
        const auto index = text.toInt(&ok);
        if (ok && index >= 0 && index < entries.size()) {
            return index;
        }
    }
    require(found >= 0, "No matching plugin, track, preset or parameter.");
    return found;
}
QJsonArray filter(QJsonArray entries, const QString &query) {
    if (query.trimmed().isEmpty()) {
        return entries;
    }
    QJsonArray out;
    for (const auto &value : entries) {
        const auto obj = value.toObject();
        QString text;
        for (const auto *key : {"name", "vendor", "uid", "path", "id", "label"}) {
            text += obj.value(QLatin1String(key)).toString() + u' ';
        }
        if (text.contains(query.trimmed(), Qt::CaseInsensitive)) {
            out.append(value);
        }
    }
    return out;
}
} // namespace

bool isPluginTool(const QString &name) {
    const auto op = operation(name);
    return std::ranges::any_of(names, [&](const auto *value) { return op == QLatin1String(value); });
}
bool pluginToolMutates(const QString &name) {
    const auto op = operation(name);
    return op == u"load_plugin" || op == u"select_plugin_preset" || op == u"set_plugin_parameters";
}
QVariantList pluginAssistantTools() {
    QVariantList out;
    const QVariantMap string{{"type", "string"}};
    const QVariantMap reference{{"oneOf", QVariantList{string, QVariantMap{{"type", "integer"}, {"minimum", 0}}}}};
    for (const auto *value : names) {
        const auto name = QString::fromLatin1(value);
        QVariantMap properties{{"timeline_id", string}};
        QStringList required{"timeline_id"};
        if (name != u"list_plugins") {
            properties.insert("track", string);
            properties.insert("effectId", string);
            required.append("track");
        }
        if (name == u"load_plugin") {
            properties.insert("plugin", QVariantMap{{"oneOf", QVariantList{string, QVariantMap{{"type", "object"}}}}});
            properties.insert("slot", QVariantMap{{"type", "string"}, {"enum", QStringList{"instrument", "effect"}}});
            properties.insert("index", QVariantMap{{"type", "integer"}, {"minimum", 0}});
            properties.insert("enabled", QVariantMap{{"type", "boolean"}});
            properties.insert("wet", QVariantMap{{"type", "number"}, {"minimum", 0}, {"maximum", 1}});
            properties.insert("gainDb", QVariantMap{{"type", "number"}, {"minimum", -60}, {"maximum", 12}});
            properties.insert("state", QVariantMap{{"type", QStringList{"string", "null"}}});
            required.append("plugin");
        } else if (name == u"select_plugin_preset") {
            properties.insert("preset", reference);
            required.append("preset");
        } else if (name == u"set_plugin_parameters") {
            const QVariantMap change{
                {"type", "object"},
                {"properties", QVariantMap{{"parameter", reference},
                                           {"value", QVariantMap{{"type", "number"}, {"minimum", 0}, {"maximum", 1}}},
                                           {"displayValue", string}}},
                {"required", QStringList{"parameter"}},
                {"additionalProperties", false}};
            properties.insert("parameter", reference);
            properties.insert("value", QVariantMap{{"type", "number"}, {"minimum", 0}, {"maximum", 1}});
            properties.insert("displayValue", string);
            properties.insert("parameters",
                              QVariantMap{{"type", "array"}, {"items", change}, {"minItems", 1}, {"maxItems", 128}});
        } else {
            properties.insert("query", string);
            if (name == u"get_plugin_parameters") {
                properties.insert("parameters", QVariantMap{{"type", "array"}, {"items", reference}});
            }
        }
        if (name == u"list_plugins") {
            properties.insert("kind",
                              QVariantMap{{"type", "string"}, {"enum", QStringList{"all", "instrument", "effect"}}});
            properties.insert("format", QVariantMap{{"type", "string"}, {"enum", QStringList{"all", "vst3", "au"}}});
            properties.insert("rescan", QVariantMap{{"type", "boolean"}});
        }
        out.append(QVariantMap{{"name", "ui_timeline_" + name},
                               {"description", QStringLiteral("Inspect or edit installed VST3/AU plugins: ") + name},
                               {"parameters", QVariantMap{{"type", "object"},
                                                          {"properties", properties},
                                                          {"required", required},
                                                          {"additionalProperties", false}}}});
    }
    return out;
}

PluginToolResult runPluginTool(const QString &name, const QJsonObject &args, const QJsonObject &original,
                               VstHostClient &client) {
    try {
        const auto op = operation(name);
        require(isPluginTool(name), "Unknown plugin tool.");
        for (const auto *key : {"track", "effectId", "query", "kind", "format", "slot"}) {
            require(!args.contains(QLatin1String(key)) || args.value(QLatin1String(key)).isString(),
                    "Plugin references and filters must be strings.");
        }
        require(!args.contains("rescan") || args.value("rescan").isBool(), "rescan must be boolean.");
        require(!args.contains("parameters") || args.value("parameters").isArray(), "parameters must be an array.");
        auto document = original;
        QJsonObject scannedPlugin;
        QString error;
        const auto rpc = [&error](bool ok) {
            if (!ok) {
                throw std::runtime_error(error.toStdString());
            }
        };
        if (op == u"list_plugins" || op == u"load_plugin") {
            std::vector<VstPluginInfo> scanned;
            rpc(client.scanSync(args.value("rescan").toBool(), &scanned, &error));
            QJsonArray plugins;
            for (const auto &info : scanned) {
                auto plugin = QJsonObject::fromVariantMap(pluginInfoToVariant(info));
                plugin.remove("key");
                plugin.insert("kind", info.isInstrument ? "instrument" : "effect");
                plugins.append(plugin);
            }
            if (op == u"list_plugins") {
                QJsonArray matching;
                const auto kind = args.value("kind").toString("all");
                const auto format = args.value("format").toString("all");
                require(QStringList{"all", "instrument", "effect"}.contains(kind), "Unknown plugin kind.");
                require(QStringList{"all", "vst3", "au"}.contains(format), "Unknown plugin format.");
                for (const auto &plugin : filter(plugins, args.value("query").toString())) {
                    const auto obj = plugin.toObject();
                    if ((kind == u"all" || obj.value("kind") == kind) &&
                        (format == u"all" || obj.value("format") == format)) {
                        matching.append(plugin);
                    }
                }
                return {{{"ok", true}, {"plugins", matching}}, original};
            }
            const auto selector = args.value("plugin");
            QJsonArray matches;
            if (selector.isString()) {
                const int index = uniqueMatch(plugins, selector, {"uid", "path", "name"});
                matches.append(plugins[index]);
            } else {
                require(selector.isObject() && !selector.toObject().isEmpty(), "Pass a plugin selector.");
                for (const auto &plugin : plugins) {
                    bool match = true;
                    const auto fields = selector.toObject();
                    for (auto it = fields.begin(); it != fields.end(); ++it) {
                        match &= plugin.toObject().value(it.key()).toString().compare(it.value().toString(),
                                                                                      Qt::CaseInsensitive) == 0;
                    }
                    if (match) {
                        matches.append(plugin);
                    }
                }
            }
            require(matches.size() == 1, "Plugin selector must match exactly one installed plugin.");
            scannedPlugin = matches[0].toObject();
        }
        auto tracks = document.value("tracks").toArray();
        const auto trackRef = args.value("track").toString();
        require(!trackRef.isEmpty(), "Pass track.");
        const bool master = trackRef == u"master";
        const int trackIndex = master ? -1 : uniqueMatch(tracks, trackRef, {"name"});
        auto track = master ? document.value("master").toObject() : tracks[trackIndex].toObject();
        if (master && !track.contains("volumeDb")) {
            track.insert("volumeDb", 0);
        }
        const auto trackId = master ? QStringLiteral("master") : track.value("id").toString();
        if (pluginToolMutates(name)) {
            require(!track.value("locked").toBool(), "Unlock the track first.");
        }
        auto effects = track.value("effects").toArray();
        QJsonArray effectRefs;
        for (const auto &effect : effects) {
            auto ref = effect.toObject();
            ref.insert("name", ref.value("plugin").toObject().value("name"));
            effectRefs.append(ref);
        }
        const auto effectRef = args.value("effectId").toString();
        int effectIndex = -1;
        bool instrument = effectRef.isEmpty() || effectRef == u"instrument";
        if (op == u"load_plugin") {
            const auto slot = args.value("slot").toString(
                scannedPlugin.value("isInstrument").toBool() && !master ? "instrument" : "effect");
            require(slot == u"instrument" || slot == u"effect", "Unknown plugin slot.");
            instrument = slot == u"instrument";
        }
        require(!instrument || (!master && track.value("type").toString() == u"midi"),
                "Instruments require a MIDI track. Pass effectId for insert effects.");
        if (!instrument) {
            require(master || track.value("type").toString() == u"midi" || track.value("type").toString() == u"audio",
                    "Effects require an audio or MIDI track.");
            if (!effectRef.isEmpty()) {
                effectIndex = uniqueMatch(effectRefs, effectRef, {"name"});
            } else {
                require(op == u"load_plugin", "Pass effectId for an insert effect.");
            }
        }
        QJsonObject slot = instrument         ? track.value("instrument").toObject()
                           : effectIndex >= 0 ? effects[effectIndex].toObject()
                                              : QJsonObject{};
        if (op == u"load_plugin") {
            require(scannedPlugin.value("isInstrument").toBool() == instrument, "Plugin kind does not match the slot.");
            auto plugin = scannedPlugin;
            for (const auto *key : {"version", "isInstrument", "kind"}) {
                plugin.remove(QLatin1String(key));
            }
            for (const auto *key : {"wet", "gainDb", "index"}) {
                require(!args.contains(QLatin1String(key)) || args.value(QLatin1String(key)).isDouble(),
                        "wet, gainDb and index must be numbers.");
            }
            require(!args.contains("enabled") || args.value("enabled").isBool(), "enabled must be boolean.");
            require(args.value("state").toString().size() <= 8000000, "Plugin state is too large.");
            const double wet = args.value("wet").toDouble(1);
            const double gain = args.value("gainDb").toDouble();
            require(std::isfinite(wet) && wet >= 0 && wet <= 1 && std::isfinite(gain) && gain >= -60 && gain <= 12,
                    "Invalid wet or gainDb.");
            require(!args.contains("state") || args.value("state").isString() || args.value("state").isNull(),
                    "State must be base64 text or null.");
            slot = {{"type", "vst"},
                    {"plugin", plugin},
                    {"state", args.contains("state") ? args.value("state") : QJsonValue(QJsonValue::Null)}};
            if (instrument) {
                slot.insert("gainDb", gain);
            } else {
                slot.insert("id", effectIndex >= 0 ? effects[effectIndex].toObject().value("id")
                                                   : QJsonValue(QUuid::createUuid().toString(QUuid::Id128)));
                slot.insert("enabled", args.value("enabled").toBool(true));
                slot.insert("wet", wet);
                if (effectIndex < 0) {
                    const double index = args.value("index").toDouble(effects.size());
                    require(std::isfinite(index) && index >= 0 && index <= effects.size() && std::floor(index) == index,
                            "Invalid effect insertion index.");
                    effectIndex = static_cast<int>(index);
                    effects.insert(effectIndex, slot);
                }
            }
        } else {
            require(slot.value("type").toString() == u"vst" && slot.value("plugin").isObject(),
                    "Load a VST3/AU plugin into this slot first.");
        }
        const auto plugin = slot.value("plugin").toObject();
        const auto instance = instrument ? QStringLiteral("inst:") + trackId
                              : master   ? QStringLiteral("master-fx:") + slot.value("id").toString()
                                         : QStringLiteral("fx:") + trackId + u':' + slot.value("id").toString();
        QJsonObject request{{"instance", instance},
                            {"path", plugin.value("path")},
                            {"uid", plugin.value("uid")},
                            {"state", slot.value("state").toString()}};
        QJsonObject result{
            {"ok", true}, {"trackId", trackId}, {"target", instrument ? "instrument" : "effect"}, {"plugin", plugin}};
        if (!instrument) {
            result.insert("effectId", slot.value("id"));
        }
        QJsonObject reply;
        if (op == u"list_plugin_presets") {
            rpc(client.listPresets(request, &reply, &error));
            result.insert("presets", filter(reply.value("presets").toArray(), args.value("query").toString()));
            result.insert("currentPresetIndex", reply.value("currentPresetIndex"));
        } else if (op == u"select_plugin_preset") {
            const auto preset = args.value("preset");
            if (preset.isDouble()) {
                request.insert("presetIndex", preset);
            } else {
                require(preset.isString() && !preset.toString().isEmpty(), "Pass preset index or name.");
                QJsonObject listed;
                rpc(client.listPresets(request, &listed, &error));
                const auto presets = listed.value("presets").toArray();
                const auto index = uniqueMatch(presets, preset, {"name"});
                request.insert("presetIndex", presets[index].toObject().value("index"));
            }
            rpc(client.selectPreset(request, &reply, &error));
            result.insert("preset", reply.value("preset"));
        } else if (op == u"get_plugin_parameters" || op == u"set_plugin_parameters") {
            rpc(client.getParameters(request, &reply, &error));
            const auto parameters = reply.value("parameters").toArray();
            if (op == u"get_plugin_parameters") {
                QJsonArray selected;
                if (args.value("parameters").isArray() && !args.value("parameters").toArray().isEmpty()) {
                    for (const auto &ref : args.value("parameters").toArray()) {
                        selected.append(parameters[uniqueMatch(parameters, ref, {"name"})]);
                    }
                } else {
                    selected = filter(parameters, args.value("query").toString());
                }
                result.insert("parameters", selected);
                result.insert("totalCount", parameters.size());
            } else {
                const auto changes =
                    args.contains("parameters") ? args.value("parameters").toArray() : QJsonArray{args};
                require(!changes.isEmpty() && changes.size() <= 128, "Pass 1 to 128 parameter changes.");
                QJsonArray resolved;
                for (const auto &value : changes) {
                    const auto change = value.toObject();
                    require(change.contains("value") != change.contains("displayValue"),
                            "Pass exactly one of value and displayValue.");
                    const auto parameter =
                        parameters[uniqueMatch(parameters, change.value("parameter"), {"name"})].toObject();
                    QJsonObject entry{{"id", parameter.value("id")}, {"index", parameter.value("index")}};
                    if (change.contains("value")) {
                        entry.insert("value", change.value("value"));
                    } else {
                        entry.insert("displayValue", change.value("displayValue"));
                    }
                    resolved.append(entry);
                }
                request.insert("changes", resolved);
                rpc(client.setParameters(request, &reply, &error));
                QJsonArray updated;
                for (const auto &entry : resolved) {
                    const auto all = reply.value("parameters").toArray();
                    updated.append(all[uniqueMatch(all, entry.toObject().value("id"), {"name"})]);
                }
                result.insert("updated", updated);
            }
        }
        if (op == u"select_plugin_preset" || op == u"set_plugin_parameters") {
            const QJsonValue state =
                reply.value("state").toString().isEmpty() ? QJsonValue(QJsonValue::Null) : reply.value("state");
            result.insert("stateUpdated", state != slot.value("state"));
            slot.insert("state", state);
        }
        if (pluginToolMutates(name)) {
            if (op == u"load_plugin") {
                result.insert("slot", instrument ? "instrument" : "effect");
                result.insert(instrument ? "instrument" : "effect", slot);
            }
            if (instrument) {
                track.insert("instrument", slot);
            } else {
                effects[effectIndex] = slot;
                track.insert("effects", effects);
            }
            if (master) {
                document.insert("master", track);
            } else {
                tracks[trackIndex] = track;
                document.insert("tracks", tracks);
            }
            result.insert(master ? "master" : "track", track);
        }
        return {result, document};
    } catch (const std::exception &error) {
        return {{{"ok", false}, {"error", QString::fromUtf8(error.what())}}, original};
    }
}
} // namespace nt::audio::vst
