#include "music/MusicProjectRules.h"

#include "music/MusicDocument.h"
#include "music/MusicProject.h"

namespace {
QString text(std::string_view value) { return QString::fromUtf8(value.data(), static_cast<qsizetype>(value.size())); }
} // namespace

QVariantList MusicProjectRules::signatures() const {
    QVariantList list;
    for (const auto& [beats, unit] : nt::music::kMusicSignatures) {
        const auto label = QStringLiteral("%1/%2").arg(beats).arg(unit);
        list.append(QVariantMap{{"label", label}, {"value", label}, {"beatsPerBar", beats}, {"beatUnit", unit}});
    }
    return list;
}

QVariantList MusicProjectRules::keyTonics() const {
    QVariantList list{QVariantMap{{"label", tr("No key")}, {"value", QString()}}};
    for (const auto tonic : nt::music::kMusicKeyTonics) {
        list.append(QVariantMap{{"label", text(tonic)}, {"value", text(tonic)}});
    }
    return list;
}

QVariantList MusicProjectRules::keyModes() const {
    return {QVariantMap{{"label", tr("Major")}, {"value", QStringLiteral("major")}},
            QVariantMap{{"label", tr("Minor")}, {"value", QStringLiteral("minor")}}};
}

QVariantList MusicProjectRules::roles() const {
    QVariantList list{QVariantMap{{"label", tr("No role")}, {"value", QString()}}};
    for (const auto role : nt::music::kMusicRoles) {
        list.append(QVariantMap{{"label", text(nt::music::musicRoleLabel(role))}, {"value", text(role)}});
    }
    return list;
}

QString MusicProjectRules::refusal(const QVariantMap& settings) const {
    return nt::music::musicProjectRefusal(nt::music::musicProjectSettings(settings));
}

QString MusicProjectRules::roleLabel(const QString& role) const { return text(nt::music::musicRoleLabel(role.toStdString())); }
