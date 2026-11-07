#include "AutoLayout.h"
#include <QJsonArray>
#include <QPointF>
#include <QSet>
#include <algorithm>
#include <cmath>
#include <numeric>
#include <unordered_map>
#include <vector>
namespace nodetool::node_editor::layout {
namespace {
struct Node { QString id; int parent = -1; QPointF position, absolute; QSizeF size; bool comment = false; };
struct Edge { int source, target; bool control; QString handle; };
struct Union {
    std::vector<int> parent;
    explicit Union(int n) : parent(n) { std::iota(parent.begin(), parent.end(),0); }
    int root(int i) { while (parent[i] != i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    void join(int a,int b) { a = root(a); b = root(b); if (a != b) { parent[b] = a; } }
};
// Each edge and vertex is visited a bounded number of times. Sorting is confined
// to layers, avoiding the web partition propagation loop on cyclic input.
void place(const std::vector<int>& members, const std::vector<Edge>& edges,
           const std::vector<Node>& nodes, QPointF origin, const LayoutOptions& options,
           QHash<int,QPointF>& positions, LayoutStats& stats) {
    const int n = static_cast<int>(members.size());
    if (!n) { return; }
    QHash<int,int> local;
    for (int i=0;i<n;++i) { local.insert(members[i],i); }
    Union unions(n);
    for (const auto& e : edges) { if (e.control) { unions.join(local.value(e.source),local.value(e.target)); } }
    std::vector<std::vector<int>> out(n), reverse(n);
    for (const auto& e : edges) {
        if (e.control) { continue; }
        const int a=unions.root(local.value(e.source)),b=unions.root(local.value(e.target));
        if (a != b) { out[a].push_back(b); reverse[b].push_back(a); }
    }
    std::vector<bool> visited(n,false);
    std::vector<int> finish;
    for (int start=0;start<n;++start) {
        if (visited[start] || unions.root(start)!=start) { continue; }
        std::vector<std::pair<int,qsizetype>> pending{{start,0}}; visited[start]=true;
        while (!pending.empty()) {
            auto& [v,next]=pending.back();
            if (next < static_cast<qsizetype>(out[v].size())) {
                const int child=out[v][next++];
                if (!visited[child]) { visited[child]=true; pending.emplace_back(child,0); }
            } else { finish.push_back(v); pending.pop_back(); }
        }
    }
    std::vector<int> component(n,-1); int count=0;
    for (auto it=finish.rbegin();it!=finish.rend();++it) {
        if (component[*it]>=0) { continue; }
        std::vector<int> pending{*it}; component[*it]=count;
        while (!pending.empty()) {
            const int v=pending.back(); pending.pop_back();
            for (const int child : reverse[v]) { if (component[child]<0) { component[child]=count; pending.push_back(child); } }
        }
        ++count;
    }
    for (int i=0;i<n;++i) { component[i]=component[unions.root(i)]; }
    std::vector<std::vector<int>> successors(count);
    std::vector<std::vector<std::pair<int,double>>> incoming(n);
    std::vector<int> degree(count,0),rank(count,0);
    for (const auto& e : edges) {
        if (e.control) { continue; }
        const int a=local.value(e.source),b=local.value(e.target), ca=component[a],cb=component[b];
        if (ca != cb) {
            successors[ca].push_back(cb); ++degree[cb];
            const auto handle=options.outputOrder.value(nodes[members[a]].id).indexOf(e.handle);
            incoming[b].push_back({a,handle<0 ? 0.0 : handle/1000.0});
        }
    }
    std::vector<int> queue;
    for (int c=0;c<count;++c) { if (degree[c]==0) { queue.push_back(c); } }
    for (qsizetype head=0;head<static_cast<qsizetype>(queue.size());++head) {
        const int c=queue[head];
        for (const int next : successors[c]) { rank[next]=std::max(rank[next],rank[c]+1); if (--degree[next]==0) { queue.push_back(next); } }
    }
    int maxRank=0;
    for (int i=0;i<n;++i) { maxRank=std::max(maxRank,rank[component[i]]); }
    std::vector<std::vector<int>> layers(maxRank+1);
    for (int i=0;i<n;++i) { layers[rank[component[i]]].push_back(i); }
    std::unordered_map<int,std::vector<int>> controlled;
    for (const auto& e : edges) { if (e.control) { controlled[local.value(e.source)].push_back(local.value(e.target)); } }
    std::vector<double> order(n,0),keys(n,0),width(maxRank+1,0),height(maxRank+1,0);
    for (int layer=0;layer<=maxRank;++layer) {
        auto& row=layers[layer];
        for (const int v : row) {
            double sum=0;
            for (const auto& [pred,handle] : incoming[v]) { sum+=order[pred]+handle; }
            keys[v]=incoming[v].empty() ? static_cast<double>(v) : sum/incoming[v].size();
        }
        std::stable_sort(row.begin(),row.end(),[&](int a,int b) { return keys[a]<keys[b]; });
        if (!controlled.empty()) {
            // A controlled node sits directly after its controller.
            std::vector<int> placed; placed.reserve(row.size());
            std::vector<bool> taken(n,false),inRow(n,false);
            for (const int v : row) { inRow[v]=true; }
            for (const int v : row) {
                if (taken[v]) { continue; }
                placed.push_back(v); taken[v]=true;
                const auto found=controlled.find(v);
                if (found==controlled.end()) { continue; }
                for (const int next : found->second) { if (inRow[next] && !taken[next]) { placed.push_back(next); taken[next]=true; } }
            }
            row=std::move(placed);
        }
        for (qsizetype i=0;i<static_cast<qsizetype>(row.size());++i) {
            const auto& size=nodes[members[row[i]]].size;
            order[row[i]]=static_cast<double>(i);
            width[layer]=std::max(width[layer],size.width()); height[layer]+=size.height()+(i ? options.nodeGap : 0);
        }
    }
    const double maxHeight=*std::max_element(height.begin(),height.end());
    double x=origin.x();
    for (int layer=0;layer<=maxRank;++layer) {
        double y=origin.y()+(maxHeight-height[layer])/2;
        for (const int v : layers[layer]) { positions.insert(members[v],QPointF(x,y)); y+=nodes[members[v]].size.height()+options.nodeGap; }
        x+=width[layer]+options.layerGap;
    }
    stats.components+=count; stats.edges+=edges.size(); stats.nodes+=members.size();
}
}
LayoutResult autoLayoutCommand(const QJsonObject& graph,const QHash<QString,QSizeF>& cardSizes,const LayoutOptions& options) {
    LayoutResult result;
    const auto fail=[&](const QString& message) { result.error=message; return result; };
    if (!graph.value("nodes").isArray() || !graph.value("edges").isArray()) { return fail("Layout requires graph node and edge arrays"); }
    if (!std::isfinite(options.layerGap) || !std::isfinite(options.nodeGap) || !std::isfinite(options.padding)
        || options.layerGap<0 || options.nodeGap<0 || options.padding<0) { return fail("Invalid layout spacing"); }
    const auto raw=graph.value("nodes").toArray();
    std::vector<Node> nodes; nodes.reserve(raw.size()); QHash<QString,int> byId;
    for (const auto& value : raw) {
        const auto n=value.toObject(); const auto id=n.value("id").toString();
        if (id.isEmpty() || byId.contains(id)) { return fail("Invalid or duplicate node ID"); }
        const auto ui=n.value("ui_properties");
        if (!ui.isUndefined() && !ui.isNull() && !ui.isObject()) { return fail("Unsupported node geometry"); }
        const auto rawPosition=ui.toObject().value("position");
        if (!rawPosition.isUndefined() && !rawPosition.isObject()) { return fail("Unsupported node position"); }
        const auto p=rawPosition.toObject();
        if ((p.contains("x") && !p.value("x").isDouble()) || (p.contains("y") && !p.value("y").isDouble())) { return fail("Invalid node position"); }
        const QPointF position(p.value("x").toDouble(),p.value("y").toDouble());
        if (!std::isfinite(position.x()) || !std::isfinite(position.y())) { return fail("Invalid node position"); }
        auto size=cardSizes.value(id,QSizeF(280,100));
        if (!std::isfinite(size.width()) || !std::isfinite(size.height()) || size.width()<=0 || size.height()<=0) { size=QSizeF(280,100); }
        byId.insert(id,static_cast<int>(nodes.size()));
        nodes.push_back({id,-1,position,{},size,n.value("type")=="nodetool.workflows.base_node.Comment"});
    }
    for (qsizetype i=0;i<raw.size();++i) {
        const auto parent=raw[i].toObject().value("parent_id").toString();
        if (!parent.isEmpty()) { if (!byId.contains(parent)) { return fail("Missing parent node"); } nodes[i].parent=byId.value(parent); }
    }
    // Memoize ancestry once, including selected-ancestor state.
    std::vector<int> state(nodes.size(),0), depth(nodes.size(),0); std::vector<bool> carried(nodes.size(),false);
    QSet<QString> selected;
    if (options.selection) { for (const auto& id : *options.selection) { if (!byId.contains(id)) { return fail("Unknown selected node"); } selected.insert(id); } }
    for (int start=0;start<static_cast<int>(nodes.size());++start) {
        if (state[start]==2) { continue; }
        std::vector<int> path; int current=start;
        while (current>=0 && state[current]==0) { state[current]=1; path.push_back(current); current=nodes[current].parent; }
        if (current>=0 && state[current]==1) { return fail("Cyclic node parents"); }
        while (!path.empty()) {
            const int v=path.back(); path.pop_back(); const int parent=nodes[v].parent;
            nodes[v].absolute=nodes[v].position+(parent>=0 ? nodes[parent].absolute : QPointF{});
            depth[v]=parent>=0 ? depth[parent]+1 : 0;
            carried[v]=parent>=0 && (carried[parent] || selected.contains(nodes[parent].id)); state[v]=2;
        }
    }
    std::vector<std::vector<int>> groups; QHash<int,int> groupIndex; std::vector<int> bucket(nodes.size(),-1);
    for (int i=0;i<static_cast<int>(nodes.size());++i) {
        if (nodes[i].comment || (options.selection && (!selected.contains(nodes[i].id) || carried[i]))) { continue; }
        const int key=options.selection ? -1 : nodes[i].parent;
        if (!groupIndex.contains(key)) { groupIndex.insert(key,static_cast<int>(groups.size())); groups.emplace_back(); }
        bucket[i]=groupIndex.value(key); groups[bucket[i]].push_back(i);
    }
    std::vector<std::vector<Edge>> edges(groups.size());
    for (const auto& value : graph.value("edges").toArray()) {
        const auto edge=value.toObject(); const auto source=edge.value("source").toString(), target=edge.value("target").toString();
        if (!byId.contains(source) || !byId.contains(target)) { continue; }
        const int a=byId.value(source), b=byId.value(target);
        if (bucket[a]<0 || bucket[a]!=bucket[b]) { continue; }
        if (edge.value("edge_type")=="lineage" || edge.value("type")=="lineage") { continue; }
        edges[bucket[a]].push_back({a,b,edge.value("edge_type")=="control" || edge.value("type")=="control",edge.value("sourceHandle").toString()});
    }
    QHash<int,QPointF> positions;
    std::vector<int> groupOrder(groups.size()); std::iota(groupOrder.begin(),groupOrder.end(),0);
    std::stable_sort(groupOrder.begin(),groupOrder.end(),[&](int a,int b) { return depth[groups[a][0]]>depth[groups[b][0]]; });
    for (const int g : groupOrder) {
        QPointF origin(options.padding,options.padding);
        const bool topLevel=!groups[g].empty() && nodes[groups[g][0]].parent<0;
        if ((options.selection || topLevel) && !groups[g].empty()) {
            origin=nodes[groups[g][0]].absolute;
            for (const int v : groups[g]) { origin.setX(std::min(origin.x(),nodes[v].absolute.x())); origin.setY(std::min(origin.y(),nodes[v].absolute.y())); }
        }
        place(groups[g],edges[g],nodes,origin,options,positions,result.stats);
        // The web resizes a group to its children's extent plus padding. The
        // siblings of that group are placed with the new size.
        if (!options.selection) {
            const int parent=nodes[groups[g][0]].parent;
            if (parent>=0) {
                double width=0,height=0;
                for (const int v : groups[g]) {
                    const auto p=positions.value(v);
                    width=std::max(width,p.x()+nodes[v].size.width()+options.padding);
                    height=std::max(height,p.y()+nodes[v].size.height()+options.padding);
                }
                nodes[parent].size=QSizeF(width,height);
                result.groupSizes.insert(nodes[parent].id,nodes[parent].size);
            }
        }
    }
    QJsonObject output;
    auto moved=positions.keys();
    std::sort(moved.begin(),moved.end(),[&](int a,int b) { return nodes[a].id<nodes[b].id; });
    // Insert in key order so QJsonObject never shifts an existing key suffix.
    for (const int i : moved) {
        auto p=positions.value(i);
        if (options.selection && nodes[i].parent>=0) { p-=nodes[nodes[i].parent].absolute; }
        auto position=raw[i].toObject().value("ui_properties").toObject().value("position").toObject();
        position.insert("x",p.x()); position.insert("y",p.y()); output.insert(nodes[i].id,position);
    }
    result.ok=true; result.command={{"op","moveNodes"},{"positions",output}}; return result;
}
}
