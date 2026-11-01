#include "TimelineListController.h"

#include <QDateTime>
#include <QJsonArray>
#include <QUuid>
#include <algorithm>

namespace nt::server {
TimelineListController::TimelineListController(QObject* parent)
    : TimelineListController(QUrl(qEnvironmentVariable("NODETOOL_SERVER_URL", "http://localhost:7777")),
          qEnvironmentVariable("NODETOOL_API_TOKEN"), qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE"), parent) {}

TimelineListController::TimelineListController(QUrl server, QString token, QString instance, QObject* parent)
    : QObject(parent), m_server(std::move(server)) {
    if (m_server.isValid() && !m_server.host().isEmpty() &&
        (m_server.scheme() == "http" || m_server.scheme() == "https")) {
        m_client = std::make_unique<ServerClient>(m_server, token);
        m_client->setExpectedInstance(instance);
    }
}

bool TimelineListController::begin() {
    if (m_busy) {
        return false;
    }
    if (!m_client) {
        finish(QStringLiteral("Configure NODETOOL_SERVER_URL to load timelines."));
        return false;
    }
    m_error.clear();
    m_busy = true;
    emit changed();
    return true;
}

void TimelineListController::finish(const QString& error) {
    m_error = error;
    m_busy = false;
    emit changed();
}

QVariantMap TimelineListController::find(const QString& id) const {
    for (const auto& row : m_documents) {
        if (row.toMap().value("id").toString() == id) {
            return row.toMap();
        }
    }
    return {};
}

QString TimelineListController::dateGroup(const QString& updatedAt) {
    const auto date = QDateTime::fromString(updatedAt, Qt::ISODateWithMs).toUTC().date();
    const auto now = QDateTime::currentDateTimeUtc().date();
    const auto days = date.daysTo(now);
    if (!date.isValid()) {
        return {};
    }
    if (days == 0) {
        return QStringLiteral("Today");
    }
    if (days == 1) {
        return QStringLiteral("Yesterday");
    }
    if (days < 7) {
        return QStringLiteral("%1 days ago").arg(days);
    }
    // relativeTime uses completed calendar years/months, then whole weeks.
    const auto past = QDateTime::fromString(updatedAt, Qt::ISODateWithMs).toLocalTime();
    const auto current = QDateTime::currentDateTime();
    auto years = current.date().year() - past.date().year();
    if (past.addYears(years) > current) {
        --years;
    }
    auto months = (current.date().year() - past.date().year()) * 12 + current.date().month() - past.date().month();
    if (past.addMonths(months) > current) {
        --months;
    }
    const auto label = [](qint64 count, const QString& unit) {
        return QStringLiteral("%1 %2%3 ago").arg(count).arg(unit, count == 1 ? QString() : QStringLiteral("s"));
    };
    if (years >= 1) {
        return label(years, QStringLiteral("year"));
    }
    if (months >= 1) {
        return label(months, QStringLiteral("month"));
    }
    const auto wholeDays = past.date().daysTo(current.date()) - (current.time() < past.time() ? 1 : 0);
    return wholeDays >= 7 ? label(wholeDays / 7, QStringLiteral("week")) : label(wholeDays, QStringLiteral("day"));
}

void TimelineListController::reloadDocuments() {
    const auto result = m_client->listTimelines(m_projectId);
    if (!result.ok()) {
        m_error = result.describe();
        return;
    }
    m_documents.clear();
    for (const auto& value : result.data.toArray()) {
        auto row = value.toObject().toVariantMap();
        row.insert("group", dateGroup(row.value("updatedAt").toString()));
        m_documents.push_back(row);
    }
    std::stable_sort(m_documents.begin(), m_documents.end(), [](const QVariant& a, const QVariant& b) {
        return QDateTime::fromString(a.toMap().value("updatedAt").toString(), Qt::ISODateWithMs) >
               QDateTime::fromString(b.toMap().value("updatedAt").toString(), Qt::ISODateWithMs);
    });
}

void TimelineListController::refresh() {
    if (!begin()) {
        return;
    }
    // Listing projects also resolves the user's Personal project, as on the web.
    const auto projects = m_client->query(QStringLiteral("projects.list"), {});
    if (!projects.ok()) {
        finish(projects.describe());
        return;
    }
    m_projects = projects.data.toArray().toVariantList();
    bool selected = false;
    QString personal;
    for (const auto& project : m_projects) {
        const auto row = project.toMap();
        selected = selected || row.value("id").toString() == m_projectId;
        if (row.value("isPersonal").toBool()) {
            personal = row.value("id").toString();
        }
    }
    if (!selected) {
        m_projectId = personal;
    }
    if (m_projectId.isEmpty()) {
        finish(QStringLiteral("Could not resolve the Personal project."));
        return;
    }
    reloadDocuments();
    finish(m_error);
}

void TimelineListController::setProjectId(const QString& id) {
    if (m_busy || id == m_projectId) {
        return;
    }
    const bool exists = std::any_of(m_projects.cbegin(), m_projects.cend(), [&id](const QVariant& project) {
        return project.toMap().value("id").toString() == id;
    });
    if (!exists) {
        return;
    }
    m_projectId = id;
    m_documents.clear();
    m_deleteTarget.clear();
    refresh();
}

QVariantMap TimelineListController::createTimeline() {
    if (m_projectId.isEmpty() || !begin()) {
        return {};
    }
    // The web sends only these fields. The server supplies size, rate and empty tracks.
    const auto id = QUuid::createUuid().toString(QUuid::Id128);
    const auto result = m_client->mutate(QStringLiteral("timeline.create"),
        {{"id", id}, {"name", "Untitled video"}, {"projectId", m_projectId}});
    if (!result.ok()) {
        finish(result.describe());
        return {};
    }
    reloadDocuments();
    finish(m_error);
    return result.data.toObject().toVariantMap();
}

bool TimelineListController::renameTimeline(const QString& id, const QString& name) {
    const auto trimmed = name.trimmed();
    const auto current = find(id);
    if (trimmed.isEmpty() || current.isEmpty() || trimmed == current.value("name").toString() || !begin()) {
        return false;
    }
    const auto result = m_client->mutate(QStringLiteral("timeline.update"), {{"id", id}, {"name", trimmed}});
    if (!result.ok()) {
        finish(result.describe());
        return false;
    }
    reloadDocuments();
    finish(m_error);
    return true;
}

void TimelineListController::requestDelete(const QString& id) {
    if (m_busy) {
        return;
    }
    m_deleteTarget = find(id);
    emit changed();
}

void TimelineListController::cancelDelete() {
    if (!m_busy) {
        m_deleteTarget.clear();
        emit changed();
    }
}

bool TimelineListController::confirmDelete() {
    const auto id = m_deleteTarget.value("id").toString();
    if (id.isEmpty() || !begin()) {
        return false;
    }
    const auto result = m_client->mutate(QStringLiteral("timeline.delete"), {{"id", id}});
    if (!result.ok()) {
        finish(result.describe());
        return false;
    }
    m_deleteTarget.clear();
    reloadDocuments();
    finish(m_error);
    return true;
}

QString TimelineListController::openTimeline(const QString& id) {
    if (m_busy || find(id).isEmpty()) {
        return {};
    }
    QUrl source = m_server;
    source.setFragment(QStringLiteral("timeline=") + id);
    const QString label = source.toString();
    emit openRequested(label);
    return label;
}
}
