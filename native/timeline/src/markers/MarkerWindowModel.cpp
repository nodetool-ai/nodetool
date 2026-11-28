#include "MarkerWindowModel.h"
#include "markers/MarkerOps.h"
#include <QSet>
#include <algorithm>
#include <cmath>
#include <limits>

MarkerWindowModel::MarkerWindowModel(QObject* parent) : QAbstractListModel(parent) {
    m_from=-1e300;
    connect(this,&MarkerWindowModel::windowPolicyChanged,this,&MarkerWindowModel::refresh);
    connect(this,&MarkerWindowModel::blocksChanged,this,&MarkerWindowModel::reload);
    connect(this,&MarkerWindowModel::queryChanged,this,&MarkerWindowModel::refresh);
    connect(this,&MarkerWindowModel::colorFilterChanged,this,&MarkerWindowModel::refresh);
}
void MarkerWindowModel::setTimeline(TimelineModel* model) {
    if (m_timeline==model) { return; }
    if (m_timeline) { disconnect(m_timeline,nullptr,this,nullptr); }
    m_timeline=model;
    if (model) {
        connect(model,&TimelineModel::markersChanged,this,&MarkerWindowModel::reload);
        connect(model,&TimelineModel::contentEndMsChanged,this,[self=QPointer<MarkerWindowModel>(this)] {
            if (self && self->m_blocks) { self->reload(); }
        });
        connect(model,&QObject::destroyed,this,[self=QPointer<MarkerWindowModel>(this)] {
            if (!self) { return; }
            self->m_timeline=nullptr;
            self->reload();
            emit self->timelineChanged();
        });
    }
    reload(); emit timelineChanged();
}
int MarkerWindowModel::rowCount(const QModelIndex& parent) const { return parent.isValid()?0:int(m_rows.size()); }
QVariant MarkerWindowModel::data(const QModelIndex& index,int role) const {
    return index.isValid() && index.row()>=0 && index.row()<rowCount() && role==Qt::UserRole
        ?QVariant::fromValue(m_rows[std::size_t(index.row())]):QVariant{};
}
QHash<int,QByteArray> MarkerWindowModel::roleNames() const { return {{Qt::UserRole,"marker"}}; }
MarkerRow MarkerWindowModel::at(int row) const { return row>=0 && row<rowCount()?m_rows[std::size_t(row)]:MarkerRow{}; }
QStringList MarkerWindowModel::ids(int first,int last) const {
    QStringList result;
    for (int i=std::max(0,first);i<=std::min(last,rowCount()-1);++i) { result.append(m_rows[std::size_t(i)].id); }
    return result;
}
QStringList MarkerWindowModel::selectedIn(const QStringList& ids) const {
    QSet<QString> present;
    for (const auto& row:m_all) { present.insert(row.id); }
    QStringList result;
    for (const auto& id:ids) { if (present.contains(id)) { result.append(id); } }
    return result;
}
void MarkerWindowModel::reload() {
    m_all.clear();
    if (m_timeline) {
        for (const auto& value:m_timeline->markersJson()) {
            const auto m=value.toObject();
            m_all.push_back({m["id"].toString(),m["label"].toString(),m["color"].toString(),m["note"].toString(),m["author"].toString(),m["timeMs"].toDouble(),std::max(0.0,m["durationMs"].toDouble()),0});
        }
    }
    std::sort(m_all.begin(),m_all.end(),[](const auto& a,const auto& b) { return a.timeMs==b.timeMs?a.id<b.id:a.timeMs<b.timeMs; });
    std::size_t leaves=1;
    while (leaves<m_all.size()) { leaves*=2; }
    m_ends.assign(leaves*2,-std::numeric_limits<double>::infinity());
    for (std::size_t i=0;i<m_all.size();++i) {
        auto& row=m_all[i];
        row.endMs=std::max(row.timeMs,row.durationMs>0?row.timeMs+row.durationMs:
            i+1<m_all.size()?m_all[i+1].timeMs:m_timeline->contentEndMs());
        m_ends[leaves+i]=m_blocks?row.endMs:row.timeMs+row.durationMs;
    }
    for (std::size_t node=leaves;node-->1;) {
        m_ends[node]=std::max(m_ends[node*2],m_ends[node*2+1]);
    }
    refresh(); emit sourceChanged();
}
void MarkerWindowModel::refresh() {
    m_queryNodeVisits=0;
    std::vector<MarkerRow> next;
    double from=m_from,to=m_to;
    const double span=to-from;
    if (m_retainWindow && span>0 && span<1e15) {
        if (!m_cached || from<m_cachedFrom || to>m_cachedTo || m_cachedTo-m_cachedFrom>4*span) {
            m_cachedFrom=from-span*.5; m_cachedTo=to+span*.5; m_cached=true;
        }
        from=m_cachedFrom; to=m_cachedTo;
    } else { m_cached=false; }
    if (std::isfinite(m_from) && std::isfinite(m_to) && to>=from) {
        const auto last=std::upper_bound(m_all.begin(),m_all.end(),to,[](double time,const auto& row) { return time<row.timeMs; });
        const auto limit=std::size_t(last-m_all.begin());
        const auto query=m_query.trimmed();
        // Prune whole time-sorted subtrees. An early long range cannot force a
        // scan of all the point markers between its start and the viewport.
        const auto visit=[&](auto&& self,std::size_t node,std::size_t first,std::size_t end)->void {
            ++m_queryNodeVisits;
            if (first>=limit || m_ends[node]<from) { return; }
            if (end-first>1) {
                const auto middle=first+(end-first)/2;
                self(self,node*2,first,middle);
                self(self,node*2+1,middle,end);
                return;
            }
            const auto& row=m_all[first];
            if (!query.isEmpty() && !row.label.contains(query,Qt::CaseInsensitive) && !row.note.contains(query,Qt::CaseInsensitive) && !row.author.contains(query,Qt::CaseInsensitive)) { return; }
            if (!m_color.isEmpty()) {
                const auto* choice=nt::markers::colorFor(row.color);
                if (m_color=="none"?!row.color.isEmpty():!choice || choice->id!=m_color) { return; }
            }
            next.push_back(row);
            // Inferred lane extents are not fields of a flag or panel row.
            if (!m_blocks) { next.back().endMs=row.timeMs+row.durationMs; }
        };
        if (!m_ends.empty()) { visit(visit,1,0,m_ends.size()/2); }
    }

    QSet<QString> wanted;
    for (const auto& row:next) { wanted.insert(row.id); }
    QSet<QString> previousIds;
    for (const auto& row:m_rows) { previousIds.insert(row.id); }
    if (wanted.size()!=qsizetype(next.size()) || previousIds.size()!=qsizetype(m_rows.size())) {
        beginResetModel(); m_rows=std::move(next); endResetModel(); emit countChanged(); return;
    }
    const int before=rowCount();
    for (int i=rowCount()-1;i>=0;) {
        if (wanted.contains(m_rows[std::size_t(i)].id)) { --i; continue; }
        const int last=i;
        while (i>=0 && !wanted.contains(m_rows[std::size_t(i)].id)) { --i; }
        const int first=i+1;
        beginRemoveRows({},first,last);
        m_rows.erase(m_rows.begin()+first,m_rows.begin()+last+1);
        endRemoveRows();
    }
    // Zoom and scroll preserve order and retain every surviving delegate.
    // A marker time edit can reorder rows, so reset only that exceptional case.
    QSet<QString> present;
    for (const auto& row:m_rows) { present.insert(row.id); }
    std::size_t retained=0;
    for (const auto& row:next) {
        if (present.contains(row.id) && m_rows[retained++].id!=row.id) {
            beginResetModel(); m_rows=std::move(next); endResetModel(); emit countChanged(); return;
        }
    }
    for (std::size_t i=0;i<next.size();) {
        if (!present.contains(next[i].id)) {
            const auto first=i;
            while (i<next.size() && !present.contains(next[i].id)) { ++i; }
            beginInsertRows({},int(first),int(i-1));
            m_rows.insert(m_rows.begin()+std::ptrdiff_t(first),next.begin()+std::ptrdiff_t(first),next.begin()+std::ptrdiff_t(i));
            endInsertRows();
        } else {
            if (m_rows[i]!=next[i]) {
                m_rows[i]=next[i]; emit dataChanged(index(int(i)),index(int(i)),{Qt::UserRole});
            }
            ++i;
        }
    }
    if (before!=rowCount()) { emit countChanged(); }
}
