#pragma once
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QObject>
#include <QUrl>
#include <QVariantList>

namespace nodetool::node_editor {

// What ExamplesPanel.qml reads and does: the workflow examples, filtered by
// group and search, and the requests to open one. The native counterpart of
// the web left panel's Examples view (web/src/components/examples/), limited
// to workflow examples. Chain, timeline, sketch, model and game examples are
// out of native scope.
//
// Three groups: "workflows" and "comfy" are the server's examples
// (GET /api/workflows/examples, split by the `comfy` tag as in
// isComfyExample), and "builtin" are the examples bundled with the app, which
// run on the local runner. The owner fills the bundled rows with setBundled().
//
// Opening a server example copies it into the account, as the web
// handleExampleClick does: POST /api/workflows with from_example_package and
// from_example_name. The copy's id comes back through workflowCopied. A
// bundled example comes back through bundledRequested.
//
// UI thread only. The network manager is a member, so every reply is parented
// to this object, and a stale reply is dropped by the epoch check.
class ExampleGallery : public QObject {
    Q_OBJECT
    // The rows that match the group filter and the search, in group order.
    // Each row: key, group, name, secondary, description, thumbnail (a server
    // path or empty) and tags.
    Q_PROPERTY(QVariantList rows READ rows NOTIFY changed)
    // The groups with their count of matching rows: key, label, count,
    // loading and error.
    Q_PROPERTY(QVariantList groups READ groups NOTIFY changed)
    Q_PROPERTY(QString filter READ filter WRITE setFilter NOTIFY changed)
    Q_PROPERTY(QString search READ search WRITE setSearch NOTIFY changed)
    Q_PROPERTY(bool connected READ connected NOTIFY changed)
    Q_PROPERTY(bool loading READ loading NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    // The key of the example being copied, if any. One copy runs at a time.
    Q_PROPERTY(QString openingKey READ openingKey NOTIFY changed)
public:
    explicit ExampleGallery(QObject *parent = nullptr);
    ~ExampleGallery() override;

    // An empty origin means no server: only the bundled examples show.
    void configure(const QUrl &origin, const QString &token = {}, const QString &userId = QStringLiteral("1"));
    // The bundled examples: maps with resource, name, description and tags.
    void setBundled(const QVariantList &examples);
    // The server's example list as GET /api/workflows/examples returns it.
    // refresh() calls it, and a test can call it directly.
    void setServerExamples(const QJsonArray &workflows);

    QVariantList rows() const;
    QVariantList groups() const;
    QString filter() const { return filter_; }
    QString search() const { return search_; }
    bool connected() const { return !origin_.isEmpty(); }
    bool loading() const { return loading_; }
    QString error() const { return error_; }
    QString openingKey() const { return openingKey_; }
    void setFilter(const QString &filter);
    void setSearch(const QString &search);

    // Reloads the server's examples. Does nothing without a server.
    Q_INVOKABLE void refresh();
    // Opens the example with this row key.
    Q_INVOKABLE void open(const QString &key);
    Q_INVOKABLE void connectServer() { emit connectRequested(); }
    Q_INVOKABLE void close() { emit closeRequested(); }

    // matchesSearch in web/src/utils/matchesSearch.ts: every word of the
    // query appears in the text, ignoring case and a common English ending.
    static bool matchesSearch(const QString &text, const QString &query);

signals:
    void changed();
    // A server example was copied into the account under this id.
    void workflowCopied(const QString &id, const QString &exampleName);
    void bundledRequested(const QString &resource);
    void copyFailed(const QString &message);
    void connectRequested();
    void closeRequested();

private:
    struct Row {
        QString key, group, name, description, secondary, thumbnail, resource, packageName, seed;
        QStringList tags;
    };
    QVariantMap rowMap(const Row &row) const;
    bool shown(const Row &row) const;
    void copy(const Row &row);

    QNetworkAccessManager network_;
    QUrl origin_;
    QString token_, user_, filter_ = QStringLiteral("all"), search_, error_, openingKey_;
    QList<Row> server_, bundled_;
    // configure() bumps the epoch, which drops every reply. A refresh bumps
    // the list serial, which drops only an older list reply.
    quint64 epoch_ = 0;
    quint64 listSerial_ = 0;
    bool loading_ = false;
};

}  // namespace nodetool::node_editor
