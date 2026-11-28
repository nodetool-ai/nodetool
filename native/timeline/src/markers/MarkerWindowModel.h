#pragma once
#include "model/TimelineModel.h"
#include <QAbstractListModel>
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>
#include <vector>

// GUI-thread value snapshot. No QObject or model storage crosses to a renderer.
struct MarkerRow {
    Q_GADGET
    QML_VALUE_TYPE(markerRow)
    Q_PROPERTY(QString id MEMBER id)
    Q_PROPERTY(QString label MEMBER label)
    Q_PROPERTY(QString color MEMBER color)
    Q_PROPERTY(QString note MEMBER note)
    Q_PROPERTY(QString author MEMBER author)
    Q_PROPERTY(double timeMs MEMBER timeMs)
    Q_PROPERTY(double durationMs MEMBER durationMs)
    Q_PROPERTY(double startMs MEMBER timeMs)
    Q_PROPERTY(double endMs MEMBER endMs)
public:
    QString id, label, color, note, author;
    double timeMs=0, durationMs=0, endMs=0;
    bool operator==(const MarkerRow&) const = default;
};
Q_DECLARE_METATYPE(MarkerRow)

// GUI thread only. Sorted typed storage with an interval tree for long
// ranges that start before the viewport. Only visible rows reach QML delegates.
class MarkerWindowModel : public QAbstractListModel {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(double fromMs READ fromMs WRITE setFromMs NOTIFY fromMsChanged)
    Q_PROPERTY(double toMs READ toMs WRITE setToMs NOTIFY toMsChanged)
    Q_PROPERTY(bool blocks MEMBER m_blocks NOTIFY blocksChanged)
    Q_PROPERTY(bool retainWindow MEMBER m_retainWindow NOTIFY windowPolicyChanged)
    Q_PROPERTY(QString query MEMBER m_query NOTIFY queryChanged)
    Q_PROPERTY(QString colorFilter MEMBER m_color NOTIFY colorFilterChanged)
    Q_PROPERTY(int count READ rowCount NOTIFY countChanged)
    Q_PROPERTY(int sourceCount READ sourceCount NOTIFY sourceChanged)
public:
    explicit MarkerWindowModel(QObject* parent=nullptr);
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel*);
    int rowCount(const QModelIndex& parent={}) const override;
    QVariant data(const QModelIndex&,int) const override;
    QHash<int,QByteArray> roleNames() const override;
    Q_INVOKABLE MarkerRow at(int row) const;
    Q_INVOKABLE QStringList ids(int first,int last) const;
    const std::vector<MarkerRow>& rows() const { return m_rows; }
    double fromMs() const { return m_from; }
    double toMs() const { return m_to; }
    void setFromMs(double value) { setWindow(value,m_to); }
    void setToMs(double value) { setWindow(m_from,value); }
    void setWindow(double from,double to) {
        const bool left=from!=m_from,right=to!=m_to;
        if (!left && !right) { return; }
        m_from=from; m_to=to;
        if (!(m_retainWindow && m_to<m_from)) { refresh(); }
        if (left) { emit fromMsChanged(); }
        if (right) { emit toMsChanged(); }
    }
    std::size_t queryNodeVisits() const { return m_queryNodeVisits; }
    int sourceCount() const { return int(m_all.size()); }
    Q_INVOKABLE QStringList selectedIn(const QStringList& ids) const;
signals:
    void timelineChanged();
    void fromMsChanged();
    void toMsChanged();
    void blocksChanged();
    void windowPolicyChanged();
    void queryChanged();
    void colorFilterChanged();
    void countChanged();
    void sourceChanged();
private:
    void reload();
    void refresh();
    QPointer<TimelineModel> m_timeline;
    double m_from=0,m_to=1e300;
    bool m_blocks=false,m_retainWindow=false,m_cached=false;
    double m_cachedFrom=0,m_cachedTo=0;
    QString m_query,m_color;
    std::vector<MarkerRow> m_all,m_rows;
    std::vector<double> m_ends;
    std::size_t m_queryNodeVisits=0;
};
