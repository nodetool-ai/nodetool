#include "edit/Keymap.h"

#include "edit/KeymapData.h"

#include <QHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

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

const QHash<QString, std::vector<Entry>>& keymaps() {
    static const QHash<QString, std::vector<Entry>> maps = [] {
        QHash<QString, std::vector<Entry>> out;
        const QJsonObject presets = QJsonDocument::fromJson(QByteArray(KEYMAP_JSON)).object();
        for (auto it = presets.begin(); it != presets.end(); ++it) {
            std::vector<Entry> entries;
            for (const QJsonValue& pair : it.value().toArray()) {
                Entry entry;
                entry.action = pair.toArray().at(0).toString();
                for (const QJsonValue& b : pair.toArray().at(1).toArray()) {
                    const QJsonObject o = b.toObject();
                    entry.bindings.push_back({o.value(u"key").toString(), o.value(u"ctrl").toBool(),
                                              o.value(u"shift").toBool(), o.value(u"alt").toBool()});
                }
                entries.push_back(std::move(entry));
            }
            out.insert(it.key(), std::move(entries));
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

}  // namespace

QString resolveTimelineAction(const KeyEventLike& e, const QString& preset) {
    const auto it = keymaps().find(preset);
    if (it == keymaps().end()) return {};
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

}  // namespace nt::edit
