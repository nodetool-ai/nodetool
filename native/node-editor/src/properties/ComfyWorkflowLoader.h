#pragma once
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QObject>
#include <QPointer>
#include <QTimer>
#include <QUrl>
#include <QVariantList>

namespace nodetool::node_editor {
// The Load ComfyUI workflow dialog's state, as ComfyWorkflowLoader.tsx: the
// server parses pasted API-format JSON or a ComfyUI PNG, and the dialog shows
// the summary and the parameters the user can expose before applying.
// UI thread only. The dialog's QQuickWidget owns it as its Qt child, and the
// reply in flight is aborted when it is destroyed.
class ComfyWorkflowLoader final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString summary READ summary NOTIFY changed)
    Q_PROPERTY(QVariantList parameters READ parameters NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
public:
    explicit ComfyWorkflowLoader(QObject *parent = nullptr);
    ~ComfyWorkflowLoader() override;
    void configure(const QUrl &origin, const QString &token);
    QString summary() const { return summary_; }
    QVariantList parameters() const;
    QString error() const { return error_; }
    bool ready() const { return !schema_.isEmpty(); }
    bool busy() const { return reply_ != nullptr; }
    QJsonObject schema() const { return schema_; }
    // Pasted text is sent once typing pauses for 300 ms. A newer edit cancels
    // the request still in flight, and empty text clears the result.
    Q_INVOKABLE void setText(const QString &text);
    // A .png is sent as its embedded prompt. Any other file becomes the text.
    Q_INVOKABLE void loadFile(const QUrl &file);
    Q_INVOKABLE void apply(const QStringList &exposedHandles);
signals:
    void changed();
    void textLoaded(const QString &text);
    void applied(const QJsonObject &schema, const QStringList &exposedHandles);
private:
    void resolve(const QJsonObject &source);
    void fail(const QString &message);
    QNetworkAccessManager network_;
    QPointer<QNetworkReply> reply_;
    QTimer debounce_;
    QUrl origin_;
    QString token_, text_, summary_, error_;
    QJsonObject schema_;
};
} // namespace nodetool::node_editor
