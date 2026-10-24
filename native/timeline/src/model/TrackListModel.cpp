#include "model/TrackListModel.h"

#include <QVariantList>
#include <QVariantMap>

#include <algorithm>

namespace {

QString trackTypeName(nt::TrackType type) {
    switch (type) {
    case nt::TrackType::Video: return QStringLiteral("video");
    case nt::TrackType::Audio: return QStringLiteral("audio");
    case nt::TrackType::Overlay: return QStringLiteral("overlay");
    case nt::TrackType::Subtitle: return QStringLiteral("subtitle");
    case nt::TrackType::Midi: return QStringLiteral("midi");
    case nt::TrackType::Chord: return QStringLiteral("chord");
    }
    return QStringLiteral("video");
}

QString mediaTypeName(nt::MediaType type) {
    switch (type) {
    case nt::MediaType::Image: return QStringLiteral("image");
    case nt::MediaType::Video: return QStringLiteral("video");
    case nt::MediaType::Audio: return QStringLiteral("audio");
    case nt::MediaType::Overlay: return QStringLiteral("overlay");
    case nt::MediaType::Text: return QStringLiteral("text");
    case nt::MediaType::Shape: return QStringLiteral("shape");
    case nt::MediaType::Model3d: return QStringLiteral("model3d");
    case nt::MediaType::Group: return QStringLiteral("group");
    case nt::MediaType::Adjustment: return QStringLiteral("adjustment");
    case nt::MediaType::Midi: return QStringLiteral("midi");
    }
    return QStringLiteral("video");
}

}  // namespace

TrackListModel::TrackListModel(QObject* parent) : QAbstractListModel(parent) {}

void TrackListModel::reset(const nt::Timeline* timeline) {
    beginResetModel();
    m_timeline = timeline;
    m_rows.clear();
    if (timeline) {
        for (const auto& t : timeline->tracks) {
            m_rows.push_back(&t);
        }
        std::stable_sort(m_rows.begin(), m_rows.end(),
                         [](const nt::Track* a, const nt::Track* b) { return a->index < b->index; });
    }
    endResetModel();
}

int TrackListModel::rowCount(const QModelIndex& parent) const {
    return parent.isValid() ? 0 : static_cast<int>(m_rows.size());
}

QVariant TrackListModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.row() < 0 || index.row() >= rowCount()) {
        return {};
    }
    const nt::Track& t = *m_rows[static_cast<size_t>(index.row())];
    switch (role) {
    case TrackIdRole: return QString::fromStdString(t.id);
    case NameRole: return QString::fromStdString(t.name);
    case TypeRole: return trackTypeName(t.type);
    case IndexRole: return t.index;
    case VisibleRole: return t.visible;
    case LockedRole: return t.locked;
    case MutedRole: return t.muted;
    case ClipsRole: {
        QVariantList clips;
        for (const auto& c : m_timeline->clips) {
            if (c.trackId != t.id) {
                continue;
            }
            clips.append(QVariantMap{
                {QStringLiteral("clipId"), QString::fromStdString(c.id)},
                {QStringLiteral("name"), QString::fromStdString(c.name)},
                {QStringLiteral("startMs"), c.startMs},
                {QStringLiteral("durationMs"), c.durationMs},
                {QStringLiteral("mediaType"), mediaTypeName(c.mediaType)},
                {QStringLiteral("hidden"), c.hidden},
            });
        }
        return clips;
    }
    default: return {};
    }
}

QHash<int, QByteArray> TrackListModel::roleNames() const {
    return {
        {TrackIdRole, "trackId"},  {NameRole, "name"},     {TypeRole, "trackType"},
        {IndexRole, "trackIndex"}, {VisibleRole, "trackVisible"}, {LockedRole, "locked"},
        {MutedRole, "muted"},      {ClipsRole, "clips"},
    };
}
