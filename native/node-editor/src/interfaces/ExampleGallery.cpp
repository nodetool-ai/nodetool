#include "ExampleGallery.h"

#include <algorithm>
#include <array>

#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QRegularExpression>
#include <QUrlQuery>

namespace nodetool::node_editor {
namespace {
constexpr std::array<const char *, 2> ServerGroups{"workflows", "comfy"};

QString groupLabel(const QString &group) {
    if (group == QLatin1String("workflows")) { return QObject::tr("Workflows"); }
    if (group == QLatin1String("comfy")) { return QObject::tr("ComfyUI"); }
    return QObject::tr("Built in");
}

QString plural(qsizetype count, const QString &noun) {
    return QStringLiteral("%1 %2%3").arg(count).arg(noun, count == 1 ? QString() : QStringLiteral("s"));
}

QStringList stringList(const QJsonValue &value) {
    QStringList result;
    for (const auto &item : value.toArray()) {
        if (item.isString()) { result.append(item.toString()); }
    }
    return result;
}
}  // namespace

ExampleGallery::ExampleGallery(QObject *parent) : QObject(parent), network_(this) {}
ExampleGallery::~ExampleGallery() {
    // Replies are children of the manager. Disconnecting first keeps an abort
    // from calling back into a half-destroyed gallery.
    for (auto *reply : network_.findChildren<QNetworkReply *>()) {
        reply->disconnect(this);
        reply->abort();
    }
}

void ExampleGallery::configure(const QUrl &origin, const QString &token, const QString &userId) {
    ++epoch_;
    for (auto *reply : network_.findChildren<QNetworkReply *>()) { reply->abort(); }
    origin_ = origin;
    token_ = token;
    user_ = userId;
    server_.clear();
    error_.clear();
    openingKey_.clear();
    loading_ = false;
    emit changed();
}

void ExampleGallery::setBundled(const QVariantList &examples) {
    bundled_.clear();
    for (const auto &value : examples) {
        const auto example = value.toMap();
        const auto resource = example.value("resource").toString();
        if (resource.isEmpty()) { continue; }
        Row row{.key = QStringLiteral("builtin:") + resource,
                .group = QStringLiteral("builtin"),
                .name = example.value("name").toString(),
                .description = example.value("description").toString(),
                .resource = resource,
                .tags = example.value("tags").toStringList()};
        row.secondary = row.description.isEmpty() ? tr("Runs on this computer") : row.description;
        bundled_.append(row);
    }
    std::ranges::sort(bundled_, [](const Row &a, const Row &b) { return a.name.localeAwareCompare(b.name) < 0; });
    emit changed();
}

void ExampleGallery::setServerExamples(const QJsonArray &workflows) {
    server_.clear();
    for (const auto &value : workflows) {
        const auto workflow = value.toObject();
        const auto id = workflow["id"].toString();
        if (id.isEmpty()) { continue; }
        Row row{.key = QStringLiteral("server:") + id,
                .name = workflow["name"].toString(),
                .description = workflow["description"].toString(),
                .thumbnail = workflow["thumbnail_url"].toString(),
                .tags = stringList(workflow["tags"])};
        // isComfyExample in web/src/components/examples/useExampleGroups.ts.
        row.group = row.tags.contains(QStringLiteral("comfy")) ? QStringLiteral("comfy") : QStringLiteral("workflows");
        row.secondary = row.description.isEmpty()
                            ? plural(workflow["graph"].toObject()["nodes"].toArray().size(), QStringLiteral("node"))
                            : row.description;
        // examplePackageName and exampleSeedRef in web/src/utils/exampleWorkflow.ts.
        row.packageName = workflow["package_name"].isString() ? workflow["package_name"].toString() : QStringLiteral("nodetool-base");
        row.seed = id.endsWith(QStringLiteral(".json"), Qt::CaseInsensitive) ? id.chopped(5) : row.name;
        server_.append(row);
    }
    emit changed();
}

bool ExampleGallery::matchesSearch(const QString &text, const QString &query) {
    static const QStringList endings{"ing", "ify", "ed", "es", "e", "s"};
    const auto haystack = text.toLower();
    const auto words = query.toLower().split(QRegularExpression(QStringLiteral("\\s+")), Qt::SkipEmptyParts);
    for (auto word : words) {
        for (const auto &ending : endings) {
            if (word.endsWith(ending) && word.size() - ending.size() >= 4) {
                word.chop(ending.size());
                break;
            }
        }
        if (!haystack.contains(word)) { return false; }
    }
    return true;
}

bool ExampleGallery::shown(const Row &row) const {
    if (filter_ != QLatin1String("all") && filter_ != row.group) { return false; }
    return matchesSearch(row.name + QLatin1Char(' ') + row.secondary, search_.trimmed());
}

QVariantMap ExampleGallery::rowMap(const Row &row) const {
    return {{"key", row.key},
            {"group", row.group},
            {"name", row.name},
            {"secondary", row.secondary},
            {"description", row.description},
            {"thumbnail", row.thumbnail},
            {"tags", row.tags}};
}

QVariantList ExampleGallery::rows() const {
    QVariantList result;
    for (const char *group : ServerGroups) {
        for (const auto &row : server_) {
            if (row.group == QLatin1String(group) && shown(row)) { result.append(rowMap(row)); }
        }
    }
    for (const auto &row : bundled_) {
        if (shown(row)) { result.append(rowMap(row)); }
    }
    return result;
}

QVariantList ExampleGallery::groups() const {
    QVariantList result;
    const auto add = [&](const QString &group, const QList<Row> &source, bool fromServer) {
        int count = 0;
        for (const auto &row : source) {
            if (row.group == group && shown(row)) { ++count; }
        }
        result.append(QVariantMap{{"key", group},
                                  {"label", groupLabel(group)},
                                  {"count", count},
                                  {"loading", fromServer && loading_},
                                  {"error", fromServer ? error_ : QString()}});
    };
    for (const char *group : ServerGroups) { add(QString::fromLatin1(group), server_, true); }
    add(QStringLiteral("builtin"), bundled_, false);
    return result;
}

void ExampleGallery::setFilter(const QString &filter) {
    if (filter_ == filter) { return; }
    filter_ = filter;
    emit changed();
}

void ExampleGallery::setSearch(const QString &search) {
    if (search_ == search) { return; }
    search_ = search;
    emit changed();
}

void ExampleGallery::refresh() {
    if (origin_.isEmpty()) { return; }
    const auto epoch = epoch_;
    const auto serial = ++listSerial_;
    loading_ = true;
    error_.clear();
    emit changed();
    QNetworkRequest request(origin_.resolved(QUrl(QStringLiteral("/api/workflows/examples"))));
    request.setTransferTimeout(30000);
    if (!token_.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); }
    request.setRawHeader("x-user-id", user_.toUtf8());
    auto *reply = network_.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, serial] {
        reply->deleteLater();
        if (epoch != epoch_ || serial != listSerial_) { return; }
        loading_ = false;
        const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const auto document = QJsonDocument::fromJson(reply->readAll());
        if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300 ||
            !document.object()["workflows"].isArray()) {
            error_ = tr("Could not load the examples (HTTP %1)").arg(status);
            emit changed();
            return;
        }
        setServerExamples(document.object()["workflows"].toArray());
    });
}

void ExampleGallery::open(const QString &key) {
    if (!openingKey_.isEmpty()) { return; }
    for (const auto &row : bundled_) {
        if (row.key == key) {
            emit bundledRequested(row.resource);
            return;
        }
    }
    for (const auto &row : server_) {
        if (row.key == key) {
            copy(row);
            return;
        }
    }
}

void ExampleGallery::copy(const Row &row) {
    if (origin_.isEmpty()) { return; }
    openingKey_ = row.key;
    emit changed();
    // handleExampleClick in web/src/hooks/useWorkflowActions.ts. The server
    // fills the empty graph from the example.
    auto tags = row.tags;
    if (!tags.contains(QStringLiteral("example"))) { tags.append(QStringLiteral("example")); }
    const QJsonObject body{{"name", row.name},
                           {"description", row.description},
                           {"package_name", row.packageName},
                           {"tags", QJsonArray::fromStringList(tags)},
                           {"access", "private"},
                           {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
    auto url = origin_.resolved(QUrl(QStringLiteral("/api/workflows")));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("from_example_package"), row.packageName);
    query.addQueryItem(QStringLiteral("from_example_name"), row.seed);
    url.setQuery(query);
    QNetworkRequest request(url);
    request.setTransferTimeout(30000);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    if (!token_.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); }
    request.setRawHeader("x-user-id", user_.toUtf8());
    auto *reply = network_.post(request, QJsonDocument(body).toJson(QJsonDocument::Compact));
    const auto epoch = epoch_;
    connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, name = row.name] {
        reply->deleteLater();
        if (epoch != epoch_) { return; }
        openingKey_.clear();
        emit changed();
        const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const auto id = QJsonDocument::fromJson(reply->readAll()).object()["id"].toString();
        if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300 || id.isEmpty()) {
            emit copyFailed(tr("Could not add a copy of “%1” (HTTP %2)").arg(name).arg(status));
            return;
        }
        emit workflowCopied(id, name);
    });
}

}  // namespace nodetool::node_editor
