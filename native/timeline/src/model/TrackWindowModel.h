#pragma once

// Vertical virtualization of the tracks region (DESIGN.md D27). Tracks get
// exact tops and heights, including contributions below each base lane.
// visibleTrackWindow selects the viewport and three rows of overscan, as in
// web/src/components/timeline/Tracks/trackWindow.ts.
//
// With reuseRows, slots retain offscreen source identities. Views show rows
// between windowStart and windowEnd plus retained editors. Rebinding idle
// slots preserves the headers and lanes that stay in the viewport.

#include "model/TrackListModel.h"
#include "ui/TimelineViewState.h"

#include <QAbstractListModel>
#include <QPointer>
#include <QVariantMap>
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

// GUI thread only. Views own delegates and borrow model rows.
class TrackWindowModel : public QAbstractListModel {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TrackListModel* tracks READ tracks WRITE setTracks NOTIFY tracksChanged)
    Q_PROPERTY(TimelineViewState* viewState READ viewState WRITE setViewState NOTIFY viewStateChanged)
    Q_PROPERTY(double contentHeight READ contentHeight NOTIFY contentHeightChanged)
    Q_PROPERTY(QVariantMap extraRowHeights READ extraRowHeights WRITE setExtraRowHeights NOTIFY extraRowHeightsChanged)
    Q_PROPERTY(bool reuseRows READ reuseRows WRITE setReuseRows NOTIFY reuseRowsChanged)
    Q_PROPERTY(int windowStart READ windowStart NOTIFY windowChanged)
    Q_PROPERTY(int windowEnd READ windowEnd NOTIFY windowChanged)
    Q_PROPERTY(int trackCount READ trackCount NOTIFY trackLayoutChanged)
    Q_PROPERTY(int windowUpdates READ windowUpdates NOTIFY windowChanged)

public:
    enum Role {
        RowTopRole = Qt::UserRole + 100,
        RowHeightRole,
        SourceRowRole,
        BaseRowHeightRole,
        TrackRole,
    };

    explicit TrackWindowModel(QObject* parent = nullptr);

    TrackListModel* tracks() const { return m_tracks; }
    void setTracks(TrackListModel* tracks);
    TimelineViewState* viewState() const { return m_view; }
    void setViewState(TimelineViewState* view);
    double contentHeight() const { return m_contentHeight; }
    const QVariantMap& extraRowHeights() const { return m_extraRowHeights; }
    void setExtraRowHeights(const QVariantMap& heights);
    Q_INVOKABLE double extraHeight(const QString& id) const { return m_extraRowHeights.value(id).toDouble(); }
    Q_INVOKABLE void reportExtraHeight(const QString& id, double height);
    bool reuseRows() const { return m_reuseRows; }
    void setReuseRows(bool value);
    Q_INVOKABLE void retainTrack(QObject* owner, const QString& id, bool retain);
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
    void reuseRowsChanged();
    void tracksChanged();
    void viewStateChanged();
    void contentHeightChanged();
    void extraRowHeightsChanged();
    void windowChanged();
    void trackLayoutChanged();

private:
    void releaseRetainedTrack(QObject* owner);
    int sourceRow(int row) const;
    void updatePooledRows(const nt::TrackWindow& next);
    void relayout();
    void onVerticalZoomChanged();
    void updateWindow();
    void resetRows();

    double m_poolViewport = -1;
    int m_poolCapacity = 0;
    bool m_reuseRows = false;
    std::vector<int> m_sourceRows;
    // GUI-thread borrows. destroyed() removes each owner before it can dangle.
    QHash<QObject*, QString> m_retainedTracks;
    QPointer<TrackListModel> m_tracks;
    QPointer<TimelineViewState> m_view;
    std::vector<double> m_tops;
    std::vector<double> m_heights;
    QVariantMap m_extraRowHeights;
    double m_contentHeight = 0.0;
    double m_layoutZoom = 1.0;
    nt::TrackWindow m_window;
    int m_windowUpdates = 0;
    bool m_resetting = false;
};
