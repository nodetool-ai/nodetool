#pragma once

// Vertical virtualization of the tracks region (DESIGN.md D27). The rows of a
// `TrackListModel` get exact tops and heights (`layoutTrackRows`, without the
// script lane, folders, FX panels and automation lanes, which the prototype
// leaves out), and this model exposes only the rows that `visibleTrackWindow`
// keeps for the current vertical scroll, plus 3 rows of overscan. Both are
// copied from web/src/components/timeline/Tracks/trackWindow.ts.
//
// A scroll that keeps some rows changes only the rows at the two ends, so the
// header and lane delegates of the rows that stay are not rebuilt.

#include "model/TrackListModel.h"
#include "ui/TimelineViewState.h"

#include <QAbstractListModel>
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>

#include <vector>

namespace nt {

struct TrackWindow {
    int start = 0;
    int end = 0;
    double top = 0.0;     // spacer above the first kept row
    double bottom = 0.0;  // spacer below the last kept row
};

// `visibleTrackWindow(rows, scrollTop, viewportHeight, overscan)`.
TrackWindow visibleTrackWindow(const std::vector<double>& tops, const std::vector<double>& heights, double scrollTop,
                               double viewportHeight, int overscan = 3);

}  // namespace nt

class TrackWindowModel : public QAbstractListModel {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TrackListModel* tracks READ tracks WRITE setTracks NOTIFY tracksChanged)
    Q_PROPERTY(TimelineViewState* viewState READ viewState WRITE setViewState NOTIFY viewStateChanged)
    Q_PROPERTY(double contentHeight READ contentHeight NOTIFY contentHeightChanged)
    Q_PROPERTY(int windowStart READ windowStart NOTIFY windowChanged)
    Q_PROPERTY(int windowEnd READ windowEnd NOTIFY windowChanged)
    Q_PROPERTY(int trackCount READ trackCount NOTIFY trackLayoutChanged)
    Q_PROPERTY(int windowUpdates READ windowUpdates NOTIFY windowChanged)

public:
    enum Role {
        RowTopRole = Qt::UserRole + 100,
        RowHeightRole,
        SourceRowRole,
    };

    explicit TrackWindowModel(QObject* parent = nullptr);

    TrackListModel* tracks() const { return m_tracks; }
    void setTracks(TrackListModel* tracks);
    TimelineViewState* viewState() const { return m_view; }
    void setViewState(TimelineViewState* view);
    double contentHeight() const { return m_contentHeight; }
    int windowStart() const { return m_window.start; }
    int windowEnd() const { return m_window.end; }
    int trackCount() const { return static_cast<int>(m_tops.size()); }
    int windowUpdates() const { return m_windowUpdates; }
    const std::vector<double>& rowTops() const { return m_tops; }
    const std::vector<double>& rowHeights() const { return m_heights; }

    int rowCount(const QModelIndex& parent = QModelIndex()) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

signals:
    void tracksChanged();
    void viewStateChanged();
    void contentHeightChanged();
    void windowChanged();
    void trackLayoutChanged();

private:
    void relayout();
    void onVerticalZoomChanged();
    void updateWindow();
    void resetRows();

    QPointer<TrackListModel> m_tracks;
    QPointer<TimelineViewState> m_view;
    std::vector<double> m_tops;
    std::vector<double> m_heights;
    double m_contentHeight = 0.0;
    double m_layoutZoom = 1.0;
    nt::TrackWindow m_window;
    int m_windowUpdates = 0;
    bool m_resetting = false;
};
