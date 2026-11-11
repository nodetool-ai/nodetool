#include "RunTraceController.h"
#include "../server/WorkflowVersions.h"
#include <QLocale>
#include <cmath>
#include <QClipboard>
#include <QDateTime>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QSet>
#include <algorithm>
#include <limits>

namespace nodetool::node_editor {
namespace {
constexpr int RunPageSize = 50;
constexpr int TraceLimit = 500;
constexpr int LogPageSize = 100;
constexpr int LogMessageLimit = 200;
constexpr int PollInterval = 2000;
constexpr int CopyNotice = 2000;
constexpr qint64 ResponseLimit = 32 * 1024 * 1024;
constexpr int DisplayLimit = 32000;

QString boundedText(const QString &text)
{
    return text.size() > DisplayLimit ? text.left(DisplayLimit) + QStringLiteral("\n[Display truncated]") : text;
}

QString numberText(double value)
{
    auto text = QString::number(value, 'f', 2);
    if (text.contains('.')) {
        while (text.endsWith('0')) {
            text.chop(1);
        }
        if (text.endsWith('.')) {
            text.chop(1);
        }
    }
    return text;
}
// Matches formatDuration in TracePanel.tsx.
QString durationText(double ms)
{
    if (ms < 1) {
        return numberText(ms) + QStringLiteral(" ms");
    }
    if (ms < 1000) {
        return numberText(std::round(ms)) + QStringLiteral(" ms");
    }
    if (ms < 60000) {
        return numberText(ms / 1000) + QStringLiteral(" s");
    }
    return QStringLiteral("%1m %2s").arg(qFloor(ms / 60000)).arg(qRound(std::fmod(ms, 60000.0) / 1000));
}
QString usdText(double value)
{
    return QStringLiteral("$") + QString::number(value, 'f', 4);
}
QString valueText(const QJsonValue &value)
{
    if (value.isString()) {
        return value.toString();
    }
    if (value.isObject()) {
        return QString::fromUtf8(QJsonDocument(value.toObject()).toJson(QJsonDocument::Indented)).trimmed();
    }
    if (value.isArray()) {
        return QString::fromUtf8(QJsonDocument(value.toArray()).toJson(QJsonDocument::Indented)).trimmed();
    }
    const auto wrapped = QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact);
    return QString::fromUtf8(wrapped.mid(1, wrapped.size() - 2));
}
QVariantList attributeRows(const QJsonObject &attributes)
{
    QStringList keys = attributes.keys();
    std::sort(keys.begin(), keys.end());
    QVariantList rows;
    for (const auto &key : keys) {
        rows.append(QVariantMap{{"key", boundedText(key)}, {"value", boundedText(valueText(attributes.value(key)))}});
    }
    return rows;
}
QString spanStatusLabel(const QString &code)
{
    return code == QStringLiteral("OK") ? QStringLiteral("ok") : code == QStringLiteral("ERROR") ? QStringLiteral("error") : QStringLiteral("unset");
}
// Spans record failures as a status message, an exception event, or an error attribute.
QString spanError(const QJsonObject &record)
{
    const auto message = record["status"].toObject()["message"].toString();
    if (!message.isEmpty()) {
        return message;
    }
    for (const auto &event : record["events"].toArray()) {
        const auto object = event.toObject();
        if (object["name"].toString() == QStringLiteral("exception")) {
            const auto text = object["attributes"].toObject()["exception.message"].toString();
            if (!text.isEmpty()) {
                return text;
            }
        }
    }
    const auto attributes = record["attributes"].toObject();
    const auto exception = attributes["exception.message"].toString();
    return exception.isEmpty() ? attributes["error.message"].toString() : exception;
}
QString levelLabel(const QString &level)
{
    if (level.isEmpty()) {
        return QStringLiteral("Event");
    }
    if (level == QStringLiteral("debug")) {
        return QStringLiteral("Debug");
    }
    if (level == QStringLiteral("info")) {
        return QStringLiteral("Info");
    }
    if (level == QStringLiteral("warn")) {
        return QStringLiteral("Warning");
    }
    if (level == QStringLiteral("error")) {
        return QStringLiteral("Error");
    }
    return level;
}
QString logText(const QJsonObject &log)
{
    const auto attributes = log["attributes"].toObject();
    for (const auto &key : {"log.message", "console.output", "text"}) {
        if (attributes.value(QLatin1String(key)).isString()) {
            return attributes.value(QLatin1String(key)).toString();
        }
    }
    return QString::fromUtf8(QJsonDocument(attributes).toJson(QJsonDocument::Compact));
}
QString clockText(double ms)
{
    return QDateTime::fromMSecsSinceEpoch(qint64(ms)).toString(QStringLiteral("HH:mm:ss"));
}
QStringList flagNotices(const QJsonObject &flags, bool limited)
{
    QStringList notices;
    if (flags["content_expired"].toBool()) {
        notices.append(QStringLiteral("Run content expired."));
    }
    if (flags["content_state"].toString() == QStringLiteral("public")) {
        notices.append(QStringLiteral("Visitor run. Content was not recorded."));
    }
    if (flags["truncated"].toBool()) {
        notices.append(QStringLiteral("Recording was truncated at the run limit."));
    }
    if (flags["incomplete"].toBool()) {
        notices.append(QStringLiteral("The trace is incomplete."));
    }
    if (limited) {
        notices.append(QStringLiteral("Showing a bounded portion. Focus a span or narrow the filters to inspect more."));
    }
    return notices;
}
QString runTitle(const QJsonObject &run, const QString &workflowName, const QString &workflowId)
{
    const auto app = run["app"].toObject();
    if (!app.isEmpty() && app["operation_id"].isString()) {
        return app["operation_id"].toString();
    }
    const auto kind = run["kind"].toString();
    if (kind == QStringLiteral("workflow")) {
        for (const auto &parent : run["parents"].toArray()) {
            const auto object = parent.toObject();
            if (object["kind"].toString() == QStringLiteral("workflow") && object["id"].toString() == workflowId && !workflowName.isEmpty()) {
                return workflowName;
            }
        }
        return QStringLiteral("Workflow run");
    }
    return kind == QStringLiteral("chat") ? QStringLiteral("Chat turn") : QStringLiteral("App run");
}
QString statusWord(const QString &status)
{
    if (status.isEmpty()) {
        return status;
    }
    return status.left(1).toUpper() + status.mid(1);
}
QString runDuration(const QJsonObject &run)
{
    if (!run["ended_at"].isString()) {
        return {};
    }
    const auto start = QDateTime::fromString(run["started_at"].toString(), Qt::ISODateWithMs);
    const auto end = QDateTime::fromString(run["ended_at"].toString(), Qt::ISODateWithMs);
    if (!start.isValid() || !end.isValid() || end < start) {
        return {};
    }
    return durationText(double(start.msecsTo(end)));
}
bool terminalRun(const QString &status)
{
    return status != QStringLiteral("running");
}
}

RunTraceController::RunTraceController(QObject *parent) : QObject(parent), m_network(this)
{
    m_poll.setInterval(PollInterval);
    connect(&m_poll, &QTimer::timeout, this, &RunTraceController::tick);
    m_copyTimer.setSingleShot(true);
    m_copyTimer.setInterval(CopyNotice);
    connect(&m_copyTimer, &QTimer::timeout, this, [this] {
        m_copied.clear();
        emit changed();
    });
}

void RunTraceController::cancel()
{
    ++m_scope;
    for (auto reply : m_network.findChildren<QNetworkReply *>()) {
        reply->abort();
    }
    for (int kind = 0; kind < KindCount; ++kind) {
        ++m_sequence[kind];
        m_loading[kind] = false;
    }
    m_moreLogs = false;
}

void RunTraceController::configure(const QUrl &origin, const QString &token, const QString &userId)
{
    cancel();
    m_network.clearAccessCache();
    m_network.setCookieJar(new QNetworkCookieJar(&m_network));
    m_copied.clear();
    m_copyTimer.stop();
    m_logsExpired = false;
    m_origin = QUrl{};
    m_token.clear();
    m_user.clear();
    m_runs = {};
    m_run = {};
    m_summary = {};
    m_focus = {};
    m_focusJson.clear();
    m_selectedRun.clear();
    m_nextRuns.clear();
    m_nextLogs.clear();
    m_focusedSpan.clear();
    m_selectedLog.clear();
    m_pendingNode.clear();
    m_traceNodes = {};
    m_focusNodes = {};
    m_browserSpans = {};
    m_serverSpans = {};
    m_choices = {};
    m_logRows = {};
    m_logEntries.clear();
    m_logSources.clear();
    m_traceNotices.clear();
    m_focusNotices.clear();
    m_logNotices.clear();
    for (auto &message : m_errors) {
        message.clear();
    }
    if (origin.isEmpty()) {
        emit changed();
        return;
    }
    if ((origin.scheme() != QStringLiteral("http") && origin.scheme() != QStringLiteral("https")) || origin.host().isEmpty()
        || !origin.userInfo().isEmpty() || origin.hasQuery() || origin.hasFragment()
        || (!origin.path().isEmpty() && origin.path() != QStringLiteral("/"))) {
        m_errors[ListKind] = tr("Enter an HTTP or HTTPS server origin without credentials or a path");
        emit changed();
        return;
    }
    if (!token.isEmpty() && origin.scheme() == QStringLiteral("http") && origin.host() != QStringLiteral("localhost")
        && origin.host() != QStringLiteral("127.0.0.1") && origin.host() != QStringLiteral("::1")) {
        m_errors[ListKind] = tr("Authentication requires HTTPS for remote servers");
        emit changed();
        return;
    }
    m_origin = origin;
    m_token = token;
    m_user = userId;
    emit changed();
}

void RunTraceController::setWorkflow(const QString &id, const QString &name)
{
    m_workflowName = name;
    if (m_workflowId == id) {
        emit changed();
        return;
    }
    m_workflowId = id;
    cancel();
    m_nextLogs.clear();
    m_traceNotices.clear();
    m_focusNotices.clear();
    m_logNotices.clear();
    m_logSources.clear();
    m_copied.clear();
    m_copyTimer.stop();
    m_pendingNode.clear();
    m_logsExpired = false;
    m_runs = {};
    m_run = {};
    m_summary = {};
    m_selectedRun.clear();
    m_nextRuns.clear();
    m_focusedSpan.clear();
    m_traceNodes = {};
    m_focusNodes = {};
    m_focus = {};
    m_focusJson.clear();
    m_browserSpans = {};
    m_serverSpans = {};
    m_choices = {};
    m_logRows = {};
    m_logEntries.clear();
    m_selectedLog.clear();
    for (auto &message : m_errors) {
        message.clear();
    }
    emit changed();
}

void RunTraceController::setActive(bool active)
{
    m_active = active;
    if (active) {
        m_poll.start();
    } else {
        m_poll.stop();
    }
}

QVariantList RunTraceController::runs() const
{
    QJsonArray rows = m_runs;
    bool found = false;
    for (const auto &value : m_runs) {
        found = found || value.toObject()["id"].toString() == m_run["id"].toString();
    }
    if (!m_run.isEmpty() && !found) {
        rows.prepend(m_run);
    }
    const auto now = QDateTime::currentDateTimeUtc();
    QVariantList result;
    for (const auto &value : rows) {
        const auto run = value.toObject();
        const auto title = runTitle(run, m_workflowName, m_workflowId);
        const auto started = QDateTime::fromString(run["started_at"].toString(), Qt::ISODateWithMs);
        const auto when = started.isValid() ? WorkflowVersions::relativeTime(started, now) : QString{};
        const auto status = statusWord(run["status"].toString());
        QStringList parts{title, status};
        if (!when.isEmpty()) {
            parts.append(when);
        }
        result.append(QVariantMap{{"id", run["id"].toString()}, {"title", title}, {"status", run["status"].toString()},
                                  {"label", parts.join(QStringLiteral(" · "))}, {"duration", runDuration(run)}});
    }
    return result;
}

QString RunTraceController::selectedRunId() const
{
    return m_selectedRun;
}

QString RunTraceController::error() const
{
    for (const auto kind : {ListKind, SummaryKind, TraceKind, LogsKind}) {
        if (!m_errors[kind].isEmpty()) {
            return m_errors[kind];
        }
    }
    return {};
}

QVariantMap RunTraceController::selectedLog() const
{
    if (m_selectedLog.isEmpty() || m_logsExpired) {
        return {};
    }
    for (const auto &entry : m_logEntries) {
        if (entry["id"].toString() != m_selectedLog) {
            continue;
        }
        const auto level = entry["level"].isString() ? levelLabel(entry["level"].toString()) : entry["name"].toString();
        return {{"id", m_selectedLog},
                {"spanId", entry["span_id"].toString()},
                {"spanName", entry["span_name"].toString()},
                {"meta", clockText(entry["time_ms"].toDouble()) + QStringLiteral(" · ") + level},
                {"attributes", attributeRows(entry["attributes"].toObject())}};
    }
    return {};
}

void RunTraceController::fail(Kind kind, const QString &message)
{
    m_errors[kind] = message;
    m_loading[kind] = false;
    if (kind == LogsKind) {
        m_moreLogs = false;
    }
    emit changed();
}

void RunTraceController::request(Kind kind, const QString &procedure, const QJsonObject &input, Result done)
{
    if (m_origin.isEmpty()) {
        fail(kind, tr("Connect to a server first"));
        return;
    }
    const auto input_text = QJsonDocument(input).toJson(QJsonDocument::Compact);
    const auto path = QStringLiteral("/trpc/") + procedure + QStringLiteral("?input=") + QString::fromLatin1(QUrl::toPercentEncoding(QString::fromUtf8(input_text)));
    QNetworkRequest request(m_origin.resolved(QUrl(path)));
    request.setTransferTimeout(30000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    if (!m_token.isEmpty()) {
        request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
    }
    request.setRawHeader("x-user-id", m_user.toUtf8());
    const auto scope = m_scope;
    const auto sequence = ++m_sequence[kind];
    m_loading[kind] = true;
    m_errors[kind].clear();
    emit changed();
    auto reply = m_network.get(request);
    connect(reply, &QNetworkReply::readyRead, this, [reply] {
        if (reply->bytesAvailable() > ResponseLimit) {
            reply->abort();
        }
    });
    connect(reply, &QNetworkReply::finished, this, [this, reply, kind, scope, sequence, done = std::move(done)] {
        reply->deleteLater();
        if (scope != m_scope || sequence != m_sequence[kind]) {
            return;
        }
        const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const auto body = reply->readAll();
        QJsonParseError parse;
        const auto document = QJsonDocument::fromJson(body, &parse);
        if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300) {
            const auto message = document.object()["error"].toObject()["message"].toString();
            fail(kind, message.isEmpty() ? tr("Server request failed (HTTP %1)").arg(status) : message);
            return;
        }
        const QJsonValue data = document.object()["result"].toObject()["data"];
        if (parse.error != QJsonParseError::NoError || !data.isObject()) {
            fail(kind, tr("Server returned an invalid run response"));
            return;
        }
        m_loading[kind] = false;
        done(data.toObject());
    });
}

void RunTraceController::refresh()
{
    for (auto &message : m_errors) {
        message.clear();
    }
    loadRuns(false);
    if (!m_selectedRun.isEmpty()) {
        loadRunData();
    }
}

void RunTraceController::loadMoreRuns()
{
    if (hasMoreRuns() && !m_loading[ListKind]) {
        loadRuns(true);
    }
}

void RunTraceController::loadRuns(bool append)
{
    QJsonObject input{{"limit", RunPageSize}};
    if (!m_workflowId.isEmpty()) {
        input.insert("workflow_id", m_workflowId);
    }
    if (append) {
        input.insert("cursor", m_nextRuns);
    }
    request(ListKind, QStringLiteral("runs.list"), input, [this, append](QJsonObject result) {
        if (!result["runs"].isArray() || (!result["next_cursor"].isNull() && !result["next_cursor"].isString())) {
            fail(ListKind, tr("Server returned an invalid run list"));
            return;
        }
        QJsonArray rows = append ? m_runs : QJsonArray{};
        QSet<QString> ids;
        for (const auto &row : rows) {
            ids.insert(row.toObject()["id"].toString());
        }
        for (const auto &row : result["runs"].toArray()) {
            const auto id = row.toObject()["id"].toString();
            if (id.isEmpty()) {
                fail(ListKind, tr("Server returned an invalid run row"));
                return;
            }
            if (!ids.contains(id)) {
                rows.append(row);
                ids.insert(id);
            }
        }
        m_runs = rows;
        m_nextRuns = result["next_cursor"].toString();
        if (m_selectedRun.isEmpty() && !rows.isEmpty()) {
            m_selectedRun = rows.first().toObject()["id"].toString();
            loadRunData();
        }
        emit changed();
    });
}

void RunTraceController::selectRun(const QString &id)
{
    if (id.isEmpty() || id == m_selectedRun) {
        return;
    }
    cancel();
    m_selectedRun = id;
    m_run = {};
    m_summary = {};
    m_focusedSpan.clear();
    m_focus = {};
    m_focusJson.clear();
    m_focusNodes = {};
    m_traceNodes = {};
    m_browserSpans = {};
    m_serverSpans = {};
    m_choices = {};
    m_selectedLog.clear();
    m_logEntries.clear();
    m_logRows = {};
    m_nextLogs.clear();
    m_traceNotices.clear();
    m_focusNotices.clear();
    m_logNotices.clear();
    m_logSources.clear();
    m_logsExpired = false;
    m_copied.clear();
    m_copyTimer.stop();
    m_pendingNode.clear();
    emit changed();
    loadRunData();
}

void RunTraceController::loadRunData()
{
    loadSummary();
    loadTrace();
    if (!m_focusedSpan.isEmpty()) {
        loadFocus();
    }
    if (m_view == QStringLiteral("logs")) {
        loadLogs(false);
    }
}

void RunTraceController::loadSummary()
{
    const auto runId = m_selectedRun;
    request(SummaryKind, QStringLiteral("runs.get"), QJsonObject{{"id", runId}}, [this, runId](QJsonObject result) {
        if (runId != m_selectedRun) {
            return;
        }
        const auto run = result["run"].toObject();
        const auto summary = result["summary"].toObject();
        if (run["id"].toString().isEmpty() || summary.isEmpty()) {
            fail(SummaryKind, tr("Server returned an invalid run summary"));
            return;
        }
        m_run = run;
        const auto status = run["status"].toString();
        double cost = 0;
        const auto costs = summary["cost_by_provider"].toObject();
        for (auto it = costs.begin(); it != costs.end(); ++it) {
            cost += it.value().toDouble();
        }
        const auto started = QDateTime::fromString(run["started_at"].toString(), Qt::ISODateWithMs);
        QStringList line;
        if (!runDuration(run).isEmpty()) {
            line.append(runDuration(run));
        }
        const auto spans = summary["span_count"].toInt();
        const auto events = summary["event_count"].toInt();
        line.append(spans == 1 ? QStringLiteral("1 span") : QStringLiteral("%1 spans").arg(spans));
        line.append(events == 1 ? QStringLiteral("1 event") : QStringLiteral("%1 events").arg(events));
        if (cost > 0) {
            line.append(usdText(cost));
        }
        if (started.isValid()) {
            line.append(QStringLiteral("started ") + QLocale().toString(started.toLocalTime(), QLocale::ShortFormat));
        }
        QVariantMap map{{"status", status}, {"statusLabel", statusWord(status)}, {"line", line.join(QStringLiteral(" · "))},
                        {"failureVisible", false}, {"notices", flagNotices(summary.isEmpty() ? QJsonObject{} : QJsonObject{{"content_expired", summary["content_expired"]}, {"content_state", summary["content_state"]}, {"truncated", summary["truncated"]}, {"incomplete", summary["incomplete"]}}, false)}};
        const auto failedSpan = summary["first_failed_span_id"].toString();
        if (status == QStringLiteral("failed") || !failedSpan.isEmpty()) {
            const auto path = summary["failure_path"].toArray();
            QJsonObject failing = path.isEmpty() ? QJsonObject{} : path.last().toObject();
            for (auto it = path.end(); it != path.begin();) {
                --it;
                if (it->toObject()["error"].isString()) {
                    failing = it->toObject();
                    break;
                }
            }
            const auto name = failing["name"].toString();
            const auto message = run["error"].isString() ? run["error"].toString()
                : failing["error"].isString() ? failing["error"].toString() : QStringLiteral("No error message was recorded.");
            const bool failed = status == QStringLiteral("failed");
            QString title;
            if (failed) {
                title = name.isEmpty() ? QStringLiteral("Run failed") : QStringLiteral("Run failed in ") + name;
            } else {
                title = name.isEmpty() ? QStringLiteral("A span failed, but the run continued") : QStringLiteral("A span failed in %1, but the run continued").arg(name);
            }
            map["failureVisible"] = true;
            map["failureSeverity"] = failed ? QStringLiteral("error") : QStringLiteral("warning");
            map["failureTitle"] = title;
            map["failureMessage"] = message;
            map["failedSpanId"] = failedSpan;
        }
        m_summary = map;
        emit changed();
    });
}

void RunTraceController::loadTrace()
{
    const auto runId = m_selectedRun;
    const bool trace = m_view == QStringLiteral("trace");
    QJsonObject input{{"id", runId}, {"depth", trace ? m_depth : 64}, {"limit", TraceLimit}, {"errors_only", trace && m_errorsOnly}};
    if (trace && !m_name.isEmpty()) {
        input.insert("name", m_name);
    }
    if (runId.isEmpty()) { return; }
    request(TraceKind, QStringLiteral("runs.trace"), input, [this, runId](QJsonObject result) {
        if (runId == m_selectedRun) {
            applyTrace(result);
        }
    });
}

void RunTraceController::applyTrace(const QJsonObject &result)
{
    if (!result["nodes"].isArray()) {
        fail(TraceKind, tr("Server returned an invalid trace"));
        return;
    }
    m_traceNodes = result["nodes"].toArray();
    m_traceNotices = flagNotices(result, result["limited"].toBool());
    m_runStart = std::numeric_limits<double>::max();
    for (const auto &node : m_traceNodes) {
        m_runStart = std::min(m_runStart, node.toObject()["record"].toObject()["start_time_ms"].toDouble());
    }
    if (m_traceNodes.isEmpty()) {
        m_runStart = 0;
    }
    m_keepContext = false;
    if (!result["limited"].toBool()) {
        for (const auto &node : m_traceNodes) {
            m_keepContext = m_keepContext || node.toObject()["record"].toObject()["span_id"].toString() == m_focusedSpan;
        }
    }
    QVariantList choices;
    for (const auto &value : m_traceNodes) {
        const auto node = value.toObject();
        const auto record = node["record"].toObject();
        const auto indent = QString(qMin(node["depth"].toInt(), 8) * 2, QLatin1Char(' '));
        const auto offset = std::max(0.0, record["start_time_ms"].toDouble() - m_runStart);
        choices.append(QVariantMap{{"value", record["span_id"].toString()},
                                   {"name", record["name"].toString()},
                                   {"status", record["status"].toObject()["code"].toString()},
                                   {"depth", std::clamp(node["depth"].toInt(), 0, 8)},
                                   {"timing", QStringLiteral("+") + durationText(offset) + QStringLiteral(" · ") + durationText(record["duration_ms"].toDouble())},
                                   {"label", indent + record["name"].toString() + QStringLiteral(" · +") + durationText(offset) + QStringLiteral(" · ") + durationText(record["duration_ms"].toDouble())}});
    }
    m_choices = choices;
    rebuildLogs();
    resolvePendingNode();
    // The spans shown depend on the focus result.
    applyFocus(QJsonObject{{"__rebuild", true}});
}

void RunTraceController::loadFocus()
{
    const auto runId = m_selectedRun;
    const auto span = m_focusedSpan;
    request(FocusKind, QStringLiteral("runs.trace"), QJsonObject{{"id", runId}, {"focus_span_id", span}, {"include_content", true}},
            [this, runId, span](QJsonObject result) {
                if (runId == m_selectedRun && span == m_focusedSpan) {
                    applyFocus(result);
                }
            });
}

void RunTraceController::applyFocus(const QJsonObject &result)
{
    if (!result.contains("__rebuild")) {
        if (!result["nodes"].isArray()) {
            fail(FocusKind, tr("Server returned an invalid trace"));
            return;
        }
        m_focusNodes = result["nodes"].toArray();
        m_focusNotices = flagNotices(result, result["limited"].toBool());
        m_focus = {};
        m_focusJson.clear();
        if (!result["content_expired"].toBool()) {
            for (const auto &value : m_focusNodes) {
                const auto record = value.toObject()["record"].toObject();
                if (record["span_id"].toString() != m_focusedSpan) {
                    continue;
                }
                const auto code = record["status"].toObject()["code"].toString();
                const auto error = spanError(record);
                const auto attributes = record["attributes"].toObject();
                QStringList meta{durationText(record["duration_ms"].toDouble()),
                                 QStringLiteral("starts at +") + durationText(std::max(0.0, record["start_time_ms"].toDouble() - m_runStart))};
                if (attributes["gen_ai.usage.cost_usd"].isDouble()) {
                    meta.append(usdText(attributes["gen_ai.usage.cost_usd"].toDouble()));
                }
                QVariantList events;
                for (const auto &eventValue : record["events"].toArray()) {
                    const auto event = eventValue.toObject();
                    events.append(QVariantMap{{"label", QStringLiteral("+") + durationText(std::max(0.0, event["time_ms"].toDouble() - record["start_time_ms"].toDouble())) + QStringLiteral(" · ") + event["name"].toString()},
                                              {"attributes", attributeRows(event["attributes"].toObject())}});
                }
                m_focusJson = QString::fromUtf8(QJsonDocument(record).toJson(QJsonDocument::Indented));
                m_focus = {{"spanId", m_focusedSpan}, {"name", record["name"].toString()}, {"status", code},
                           {"statusLabel", spanStatusLabel(code)}, {"error", error}, {"meta", meta.join(QStringLiteral(" · "))},
                           {"attributes", attributeRows(attributes)}, {"events", events},
                           {"json", boundedText(m_focusJson)}};
            }
        }
    }
    // The whole run stays visible around a focused span unless the list is a bounded portion.
    const auto &source = !m_focusedSpan.isEmpty() && !m_keepContext ? m_focusNodes : m_traceNodes;
    double start = std::numeric_limits<double>::max();
    double end = 0;
    for (const auto &node : source) {
        const auto record = node.toObject()["record"].toObject();
        start = std::min(start, record["start_time_ms"].toDouble());
        end = std::max(end, record["end_time_ms"].toDouble());
    }
    const auto duration = std::max(1.0, end - (source.isEmpty() ? 0 : start));
    const auto horizon = durationText(duration);
    QVariantList browser, server;
    for (const auto &value : source) {
        const auto node = value.toObject();
        const auto record = node["record"].toObject();
        const auto code = record["status"].toObject()["code"].toString();
        const auto offset = std::max(0.0, (record["start_time_ms"].toDouble() - start) / duration * 100);
        const auto width = std::max(0.5, std::min(100 - offset, record["duration_ms"].toDouble() / duration * 100));
        auto durationLabel = durationText(record["duration_ms"].toDouble());
        const QJsonValue cost = record["attributes"].toObject()["gen_ai.usage.cost_usd"];
        if (cost.isDouble()) {
            durationLabel += QStringLiteral(" · ") + usdText(cost.toDouble());
        }
        const QVariantMap row{{"spanId", record["span_id"].toString()}, {"name", record["name"].toString()}, {"status", code},
                              {"statusLabel", spanStatusLabel(code)}, {"depth", node["depth"].toInt()}, {"duration", durationLabel},
                              {"offset", offset}, {"width", width}, {"horizon", horizon}, {"error", spanError(record)},
                              {"timeline", QStringLiteral("%1 timeline: %2 ms from start, %3 ms duration").arg(record["name"].toString(), QString::number(std::max(0.0, record["start_time_ms"].toDouble() - start), 'f', 1), QString::number(record["duration_ms"].toDouble(), 'f', 1))}};
        if (record["resource"].toObject()["nodetool.trace.source"].toString() == QStringLiteral("browser")) {
            browser.append(row);
        } else {
            server.append(row);
        }
    }
    m_browserSpans = browser;
    m_serverSpans = server;
    emit changed();
}

void RunTraceController::loadLogs(bool append)
{
    if (m_selectedRun.isEmpty()) {
        return;
    }
    const auto runId = m_selectedRun;
    QJsonObject input{{"id", runId}, {"include_content", true}, {"limit", LogPageSize}};
    if (!m_logLevel.isEmpty()) {
        input.insert("level", m_logLevel);
    }
    if (!m_logSource.isEmpty()) {
        input.insert("source", m_logSource);
    }
    if (!m_focusedSpan.isEmpty()) {
        input.insert("span_id", m_focusedSpan);
    }
    if (append) {
        input.insert("cursor", m_nextLogs);
    }
    m_moreLogs = append;
    request(LogsKind, QStringLiteral("runs.logs"), input, [this, runId, append](QJsonObject result) {
        m_moreLogs = false;
        if (runId == m_selectedRun) {
            applyLogs(result, append);
        }
    });
}

void RunTraceController::applyLogs(const QJsonObject &result, bool append)
{
    if (!result["logs"].isArray() || (!result["next_cursor"].isNull() && !result["next_cursor"].isString())) {
        fail(LogsKind, tr("Server returned an invalid log page"));
        return;
    }
    if (!append) {
        m_logEntries.clear();
    }
    QSet<QString> ids;
    for (const auto &entry : m_logEntries) {
        ids.insert(entry["id"].toString());
    }
    for (const auto &value : result["logs"].toArray()) {
        const auto entry = value.toObject();
        if (!ids.contains(entry["id"].toString())) {
            m_logEntries.append(entry);
            ids.insert(entry["id"].toString());
        }
    }
    std::stable_sort(m_logEntries.begin(), m_logEntries.end(), [](const QJsonObject &a, const QJsonObject &b) {
        if (a["time_ms"].toDouble() != b["time_ms"].toDouble()) {
            return a["time_ms"].toDouble() < b["time_ms"].toDouble();
        }
        return a["id"].toString() < b["id"].toString();
    });
    m_nextLogs = result["next_cursor"].toString();
    m_logsExpired = result["content_expired"].toBool() || (append && m_logsExpired);
    m_logNotices = flagNotices(result, result["limited"].toBool());
    rebuildLogs();
    emit changed();
}

void RunTraceController::rebuildLogs()
{
    QVariantList rows;
    QStringList sources;
    for (const auto &entry : m_logEntries) {
        const auto source = entry["source"].isString() ? entry["source"].toString() : QString{};
        if (!source.isEmpty() && !sources.contains(source)) {
            sources.append(source);
        }
        auto message = logText(entry).left(LogMessageLimit);
        rows.append(QVariantMap{{"id", entry["id"].toString()}, {"time", clockText(entry["time_ms"].toDouble())},
                                {"level", levelLabel(entry["level"].toString())}, {"levelKey", entry["level"].toString()},
                                {"source", source.isEmpty() ? entry["name"].toString() : source}, {"spanId", entry["span_id"].toString()},
                                {"spanName", entry["span_name"].toString()}, {"message", message}});
    }
    if (!m_logSource.isEmpty() && !sources.contains(m_logSource)) {
        sources.append(m_logSource);
    }
    m_logRows = rows;
    m_logSources = sources;
}

void RunTraceController::resolvePendingNode()
{
    if (m_pendingNode.isEmpty()) {
        return;
    }
    for (const auto &value : m_traceNodes) {
        const auto record = value.toObject()["record"].toObject();
        if (record["attributes"].toObject()["node.id"].toString() == m_pendingNode) {
            m_pendingNode.clear();
            focusSpan(record["span_id"].toString());
            return;
        }
    }
}

void RunTraceController::setView(const QString &view)
{
    const auto next = view == QStringLiteral("logs") ? view : QStringLiteral("trace");
    if (next == m_view) {
        return;
    }
    m_view = next;
    emit changed();
    if (!m_selectedRun.isEmpty()) {
        loadTrace();
        if (m_view == QStringLiteral("logs")) {
            loadLogs(false);
        }
    }
}

void RunTraceController::setErrorsOnly(bool value)
{
    if (m_errorsOnly != value) {
        m_errorsOnly = value;
        emit changed();
        loadTrace();
    }
}

void RunTraceController::setNameFilter(const QString &value)
{
    const auto next = value.left(200);
    if (m_name != next) {
        m_name = next;
        emit changed();
        loadTrace();
    }
}

void RunTraceController::setDepth(int value)
{
    const int next = value <= 4 ? 4 : value <= 16 ? 16 : 64;
    if (m_depth != next) {
        m_depth = next;
        emit changed();
        loadTrace();
    }
}

void RunTraceController::clearFilters()
{
    m_errorsOnly = false;
    m_name.clear();
    m_depth = 64;
    emit changed();
    loadTrace();
}

void RunTraceController::focusSpan(const QString &spanId)
{
    if (spanId.isEmpty()) {
        clearFocus();
        return;
    }
    m_pendingNode.clear();
    m_focusedSpan = spanId;
    m_focus = {};
    m_focusJson.clear();
    m_focusNodes = {};
    m_focusNotices.clear();
    m_selectedLog.clear();
    emit changed();
    loadFocus();
    if (m_view == QStringLiteral("logs")) {
        loadLogs(false);
    }
}

void RunTraceController::clearFocus()
{
    if (m_focusedSpan.isEmpty()) {
        return;
    }
    m_focusedSpan.clear();
    m_focus = {};
    m_focusJson.clear();
    m_focusNodes = {};
    m_focusNotices.clear();
    ++m_sequence[FocusKind];
    m_loading[FocusKind] = false;
    m_errors[FocusKind].clear();
    applyFocus(QJsonObject{{"__rebuild", true}});
    if (m_view == QStringLiteral("logs")) {
        loadLogs(false);
    }
}

void RunTraceController::showFailingSpan()
{
    const auto span = m_summary["failedSpanId"].toString();
    if (!span.isEmpty()) {
        setView(QStringLiteral("trace"));
        focusSpan(span);
    }
}

void RunTraceController::focusNode(const QString &nodeId)
{
    m_pendingNode = nodeId;
    if (!m_traceNodes.isEmpty()) {
        resolvePendingNode();
    }
}

void RunTraceController::setLogLevel(const QString &value)
{
    if (m_logLevel != value) {
        m_logLevel = value;
        emit changed();
        loadLogs(false);
    }
}

void RunTraceController::setLogSource(const QString &value)
{
    if (m_logSource != value) {
        m_logSource = value;
        emit changed();
        loadLogs(false);
    }
}

void RunTraceController::loadMoreLogs()
{
    if (hasMoreLogs() && !m_loading[LogsKind]) {
        loadLogs(true);
    }
}

void RunTraceController::selectLog(const QString &id)
{
    m_selectedLog = id;
    emit changed();
}

void RunTraceController::closeLog()
{
    m_selectedLog.clear();
    emit changed();
}

void RunTraceController::copyText(const QString &text)
{
    if (auto *clipboard = QGuiApplication::clipboard()) {
        clipboard->setText(text);
    }
    m_copied = text;
    m_copyTimer.start();
    emit changed();
}

void RunTraceController::copyFocusedSpan()
{
    if (!m_focus.isEmpty()) {
        copyText(m_focusJson);
    }
}

void RunTraceController::tick()
{
    if (!m_active || m_selectedRun.isEmpty() || terminalRun(m_summary.value("status", QStringLiteral("completed")).toString())) {
        return;
    }
    loadSummary();
    loadTrace();
    if (!m_focusedSpan.isEmpty()) {
        loadFocus();
    }
    if (m_view == QStringLiteral("logs") && !m_loading[LogsKind]) {
        loadLogs(false);
    }
}
}
