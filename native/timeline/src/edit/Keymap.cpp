#include "edit/Keymap.h"

#include "edit/KeymapData.h"
#include "edit/KeymapOverlay.h"

#include <QHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <algorithm>
#include <vector>

namespace nt::edit {

namespace {

struct Binding {
    QString key;
    bool ctrl = false;
    bool shift = false;
    bool alt = false;
};

struct Entry {
    QString action;
    std::vector<Binding> bindings;
};

using Keymaps = QHash<QString, std::vector<Entry>>;

// One chord: "A" and "a" are one key.
bool sameChord(const Binding& a, const Binding& b) {
    const auto key = [](const QString& k) { return k.size() == 1 ? k.toLower() : k; };
    return key(a.key) == key(b.key) && a.ctrl == b.ctrl && a.shift == b.shift && a.alt == b.alt;
}

Entry entryOf(const QJsonValue& pair) {
    Entry entry;
    entry.action = pair.toArray().at(0).toString();
    for (const QJsonValue& b : pair.toArray().at(1).toArray()) {
        const QJsonObject o = b.toObject();
        entry.bindings.push_back({o.value(u"key").toString(), o.value(u"ctrl").toBool(),
                                  o.value(u"shift").toBool(), o.value(u"alt").toBool()});
    }
    return entry;
}

const Keymaps& webKeymaps() {
    static const Keymaps maps = [] {
        Keymaps out;
        const QJsonObject presets = QJsonDocument::fromJson(QByteArray(KEYMAP_JSON)).object();
        for (auto it = presets.begin(); it != presets.end(); ++it) {
            std::vector<Entry> entries;
            for (const QJsonValue& pair : it.value().toArray()) { entries.push_back(entryOf(pair)); }
            out.insert(it.key(), std::move(entries));
        }
        return out;
    }();
    return maps;
}

const Keymaps& keymaps() {
    static const Keymaps maps = [] {
        Keymaps out = webKeymaps();
        const QJsonObject overlay = QJsonDocument::fromJson(QByteArray(KEYMAP_OVERLAY_JSON)).object();
        for (auto it = overlay.begin(); it != overlay.end(); ++it) {
            auto& entries = out[it.key()];
            for (const QJsonValue& pair : it.value().toArray()) {
                Entry entry = entryOf(pair);
                const auto same = [&](const Entry& e) { return e.action == entry.action; };
                const auto at = std::ranges::find_if(entries, same);
                if (entry.bindings.empty()) {
                    if (at != entries.end()) { entries.erase(at); }
                } else if (at != entries.end()) {
                    *at = std::move(entry);
                } else {
                    entries.push_back(std::move(entry));
                }
            }
        }
        // Each context over each preset (KEYMAP_CONTEXT_JSON).
        const QJsonObject contexts = QJsonDocument::fromJson(QByteArray(KEYMAP_CONTEXT_JSON)).object();
        const auto presets = out.keys();
        for (auto it = contexts.begin(); it != contexts.end(); ++it) {
            for (const auto& preset : presets) {
                auto entries = out.value(preset);
                for (const QJsonValue& pair : it.value().toArray()) {
                    const Entry entry = entryOf(pair);
                    for (Entry& other : entries) {
                        std::erase_if(other.bindings, [&](const Binding& b) {
                            return std::ranges::any_of(entry.bindings, [&](const Binding& own) { return sameChord(b, own); });
                        });
                    }
                    const auto at = std::ranges::find_if(entries, [&](const Entry& e) { return e.action == entry.action; });
                    if (at != entries.end()) {
                        at->bindings.insert(at->bindings.begin(), entry.bindings.begin(), entry.bindings.end());
                    } else {
                        entries.push_back(entry);
                    }
                }
                std::erase_if(entries, [](const Entry& e) { return e.bindings.empty(); });
                out.insert(preset + u'@' + it.key(), std::move(entries));
            }
        }
        return out;
    }();
    return maps;
}

// /^[a-z]$/i
bool isLetter(const QString& key) {
    if (key.size() != 1) return false;
    const char16_t c = key.at(0).unicode();
    return (c >= u'a' && c <= u'z') || (c >= u'A' && c <= u'Z');
}

// /^[0-9]$/
bool isDigit(const QString& key) {
    return key.size() == 1 && key.at(0).unicode() >= u'0' && key.at(0).unicode() <= u'9';
}

// The `e.code` of a binding's physical key, or empty.
QString codeOf(const QString& key) {
    if (isLetter(key)) return QStringLiteral("Key") + key.toUpper();
    if (isDigit(key)) return QStringLiteral("Digit") + key;
    static const QHash<QString, QString> symbols{
        {QStringLiteral(","), QStringLiteral("Comma")},         {QStringLiteral("."), QStringLiteral("Period")},
        {QStringLiteral("'"), QStringLiteral("Quote")},         {QStringLiteral("["), QStringLiteral("BracketLeft")},
        {QStringLiteral("]"), QStringLiteral("BracketRight")},  {QStringLiteral(";"), QStringLiteral("Semicolon")},
        {QStringLiteral("\\"), QStringLiteral("Backslash")},    {QStringLiteral("="), QStringLiteral("Equal")},
        {QStringLiteral("-"), QStringLiteral("Minus")},         {QStringLiteral("`"), QStringLiteral("Backquote")},
    };
    return symbols.value(key);
}

bool matches(const Binding& binding, const KeyEventLike& e) {
    const bool ctrl = e.ctrlKey || e.metaKey;
    const QString key = isLetter(e.key) ? e.key.toLower() : e.key;
    const QString bindingCode = codeOf(binding.key);
    const bool symbolKey = binding.key.size() == 1 && !isLetter(binding.key);
    const bool byCode = !e.code.isEmpty() && !bindingCode.isEmpty() &&
                        (binding.alt || (symbolKey && binding.shift) || binding.key == u"`");
    if (byCode ? e.code != bindingCode : key != binding.key) return false;
    if (binding.key == u"?") return true;
    if (ctrl != binding.ctrl) return false;
    if (e.altKey != binding.alt) return false;
    const bool symbol = binding.key.size() == 1 && !isLetter(binding.key);
    if (!symbol && e.shiftKey != binding.shift) return false;
    if (symbol && binding.shift && !e.shiftKey) return false;
    return true;
}

QString resolveIn(const Keymaps& maps, const KeyEventLike& e, const QString& preset) {
    const auto it = maps.constFind(preset);
    if (it == maps.constEnd()) return {};
    QString best;
    int bestWeight = -1;
    for (const Entry& entry : *it) {
        for (const Binding& b : entry.bindings) {
            if (!matches(b, e)) continue;
            const int weight = (b.ctrl ? 1 : 0) + (b.shift ? 1 : 0) + (b.alt ? 1 : 0);
            if (weight > bestWeight) {
                best = entry.action;
                bestWeight = weight;
            }
        }
    }
    return best;
}

}  // namespace

QString keymapName(const QString& preset, const QString& context) {
    return context.isEmpty() ? preset : preset + u'@' + context;
}

QStringList keymapContexts() {
    return QJsonDocument::fromJson(QByteArray(KEYMAP_CONTEXT_JSON)).object().keys();
}

QString resolveTimelineAction(const KeyEventLike& e, const QString& preset) { return resolveIn(keymaps(), e, preset); }

QString resolveWebTimelineAction(const KeyEventLike& e, const QString& preset) { return resolveIn(webKeymaps(), e, preset); }

std::vector<PresetBinding> presetBindings(const QString& preset) {
    std::vector<PresetBinding> out;
    for (const Entry& entry : keymaps().value(preset)) {
        for (const Binding& b : entry.bindings) { out.push_back({entry.action, b.key, b.ctrl, b.shift, b.alt}); }
    }
    return out;
}

std::vector<QStringList> actionBindingKeys(const QString& preset, const QString& action) {
    static const QHash<QString, QString> labels{{QStringLiteral("ArrowLeft"), QStringLiteral("\u2190")},
                                                {QStringLiteral("ArrowRight"), QStringLiteral("\u2192")},
                                                {QStringLiteral("ArrowUp"), QStringLiteral("\u2191")},
                                                {QStringLiteral("ArrowDown"), QStringLiteral("\u2193")},
                                                {QStringLiteral(" "), QStringLiteral("Space")},
                                                {QStringLiteral("Escape"), QStringLiteral("Esc")},
                                                {QStringLiteral("PageUp"), QStringLiteral("Page Up")},
                                                {QStringLiteral("PageDown"), QStringLiteral("Page Down")},
                                                {QStringLiteral("Home"), QStringLiteral("Home")},
                                                {QStringLiteral("End"), QStringLiteral("End")}};
    std::vector<QStringList> out;
    const auto it = keymaps().constFind(preset);
    if (it == keymaps().constEnd()) return out;
    for (const Entry& entry : *it) {
        if (entry.action != action) continue;
        for (const Binding& b : entry.bindings) {
            QStringList parts;
            if (b.ctrl) parts.append(QStringLiteral("Ctrl"));
            if (b.alt) parts.append(QStringLiteral("Alt"));
            if (b.shift) parts.append(QStringLiteral("Shift"));
            parts.append(labels.value(b.key, b.key.toUpper()));
            out.push_back(parts);
        }
    }
    return out;
}

QString formatActionShortcut(const QString& preset, const QString& action) {
    const auto combos = actionBindingKeys(preset, action);
    return combos.empty() ? QString() : combos.front().join(u'+');
}

QJsonObject shortcutSheet(const QString& preset) {
    QJsonObject sheet = QJsonDocument::fromJson(QByteArray(SHORTCUT_SHEET_JSON)).object();
    QJsonArray groups;
    for (const QJsonValue& g : sheet.value(u"groups").toArray()) {
        QJsonObject group = g.toObject();
        QJsonArray rows;
        for (const QJsonValue& r : group.value(u"rows").toArray()) {
            QJsonObject row = r.toObject();
            QJsonArray combos;
            if (row.contains(u"action")) {
                for (const QStringList& keys : actionBindingKeys(preset, row.value(u"action").toString())) {
                    combos.append(QJsonArray::fromStringList(keys));
                }
            } else {
                combos.append(row.value(u"keys"));
            }
            row.insert(QStringLiteral("combos"), combos);
            rows.append(row);
        }
        group.insert(QStringLiteral("rows"), rows);
        groups.append(group);
    }
    sheet.insert(QStringLiteral("groups"), groups);
    return sheet;
}

}  // namespace nt::edit
