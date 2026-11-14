#include "WorkflowBrowser.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QRegularExpression>
#include <QSettings>
#include <QUrlQuery>
#include <QSet>
#include <algorithm>

namespace nodetool::node_editor {
WorkflowBrowser::WorkflowBrowser(QObject *parent) : QObject(parent), m_network(this) {}
void WorkflowBrowser::cancel() {
  ++m_epoch;
  for (auto reply : m_network.findChildren<QNetworkReply *>()) { reply->abort(); }
  m_loading = false;
  m_projectsLoading = false;
  m_busy = false;
}
void WorkflowBrowser::configure(const QUrl &origin, const QString &token, const QString &userId) {
  cancel();
  m_network.clearAccessCache();
  m_network.setCookieJar(new QNetworkCookieJar(&m_network));
  m_origin = QUrl{};
  m_token.clear();
  m_user.clear();
  m_project.clear();
  m_search.clear();
  m_rows = {};
  m_projects = {};
  m_triggers.clear();
  m_selected.clear();
  m_next.clear();
  m_error.clear();
  if (origin.isEmpty()) { emit changed(); return; }
  if ((origin.scheme() != "http" && origin.scheme() != "https") || origin.host().isEmpty() ||
      !origin.userInfo().isEmpty() || origin.hasQuery() || origin.hasFragment() ||
      (!origin.path().isEmpty() && origin.path() != "/")) {
    fail(tr("Enter an HTTP or HTTPS server origin without credentials or a path"));
    return;
  }
  if (!token.isEmpty() && origin.scheme() == "http" && origin.host() != "localhost" &&
      origin.host() != "127.0.0.1" && origin.host() != "::1") {
    fail(tr("Authentication requires HTTPS for remote servers"));
    return;
  }
  m_origin = origin;
  m_token = token;
  m_user = userId;
  emit changed();
}
QVariantList WorkflowBrowser::rows() const {
  // WorkflowList.tsx filters by name, favourites and every selected tag, and
  // WorkflowListView.tsx orders by name or by newest update with day groups.
  struct Row { QVariantMap map; QDateTime updated; };
  QList<Row> kept;
  for (const auto &value : m_rows) {
    const auto row = value.toObject();
    const auto id = row.value("id").toString();
    if (!row.value("name").toString().contains(m_search, Qt::CaseInsensitive)) { continue; }
    if (m_favoritesOnly && !m_favorites.contains(id)) { continue; }
    const auto tags = row.value("tags").toVariant().toStringList();
    if (!std::all_of(m_selectedTags.begin(), m_selectedTags.end(), [&](const QString &tag) { return tags.contains(tag); })) { continue; }
    kept.append({row.toVariantMap(), QDateTime::fromString(row.value("updated_at").toString(), Qt::ISODateWithMs)});
  }
  if (m_sortBy == "name") {
    std::stable_sort(kept.begin(), kept.end(), [](const Row &a, const Row &b) {
      // String.localeCompare orders letters before case.
      const auto left = a.map["name"].toString(), right = b.map["name"].toString();
      const auto folded = QString::compare(left, right, Qt::CaseInsensitive);
      return folded != 0 ? folded < 0 : QString::localeAwareCompare(left, right) < 0;
    });
  } else {
    std::stable_sort(kept.begin(), kept.end(), [](const Row &a, const Row &b) { return a.updated > b.updated; });
  }
  const auto now = m_now.isValid() ? m_now : QDateTime::currentDateTimeUtc();
  QVariantList result;
  for (auto &row : kept) {
    const auto id = row.map["id"].toString();
    row.map["favorite"] = m_favorites.contains(id);
    row.map["selected"] = m_selected.contains(id);
    row.map["current"] = !id.isEmpty() && id == m_current;
    row.map["group"] = m_sortBy == "date" && row.updated.isValid() ? dayGroup(row.updated, now) : QString();
    row.map["updatedLabel"] = row.updated.isValid() ? relativeDate(row.updated, now) : QString();
    row.map["trigger"] = m_triggers.value(id);
    result.append(row.map);
  }
  return result;
}
QStringList WorkflowBrowser::availableTags() const {
  QSet<QString> tags;
  for (const auto &row : m_rows) {
    for (const auto &tag : row.toObject().value("tags").toArray()) {
      if (tag.isString()) { tags.insert(tag.toString()); }
    }
  }
  QStringList sorted(tags.begin(), tags.end());
  sorted.sort();
  return sorted;
}
namespace {
QString ago(qint64 count, const QString &singular, const QString &plural) {
  return QStringLiteral("%1 %2 ago").arg(count).arg(count == 1 ? singular : plural);
}
// Whole calendar months from `from` to `to`, as date-fns differenceInMonths counts them.
qint64 calendarMonths(const QDateTime &from, const QDateTime &to) {
  qint64 months = (to.date().year() - from.date().year()) * 12 + to.date().month() - from.date().month();
  if (months > 0 && from.addMonths(int(months)) > to) { --months; }
  return std::max<qint64>(months, 0);
}
}
QString WorkflowBrowser::dayGroup(const QDateTime &updated, const QDateTime &now) {
  const auto days = updated.toUTC().date().daysTo(now.toUTC().date());
  if (days <= 0) { return QStringLiteral("Today"); }
  if (days == 1) { return QStringLiteral("Yesterday"); }
  if (days < 7) { return QStringLiteral("%1 days ago").arg(days); }
  // formatDateAndTime.ts relativeTime: calendar years and months, then weeks.
  const auto months = calendarMonths(updated, now);
  if (months >= 12) { return ago(months / 12, "year", "years"); }
  if (months >= 1) { return ago(months, "month", "months"); }
  return ago(updated.daysTo(now) / 7, "week", "weeks");
}
QString WorkflowBrowser::relativeDate(const QDateTime &updated, const QDateTime &now) {
  // Intl.RelativeTimeFormat with numeric "auto" over WorkflowListItem.tsx's units.
  const auto seconds = updated.secsTo(now);
  if (seconds < 5) { return QStringLiteral("now"); }
  struct Unit { const char *name; const char *previous; qint64 seconds; };
  static constexpr Unit units[] = {{"year", "last year", 31'557'600}, {"month", "last month", 2'629'800},
                                   {"week", "last week", 604'800}, {"day", "yesterday", 86'400},
                                   {"hour", nullptr, 3'600}, {"minute", nullptr, 60}, {"second", nullptr, 1}};
  for (const auto &unit : units) {
    if (seconds < unit.seconds) { continue; }
    const auto count = seconds / unit.seconds;
    if (count == 1 && unit.previous) { return QString::fromLatin1(unit.previous); }
    return QStringLiteral("%1 %2%3 ago").arg(count).arg(QString::fromLatin1(unit.name), count == 1 ? "" : "s");
  }
  return QStringLiteral("now");
}
QString WorkflowBrowser::nextCopyName(const QString &name, const QStringList &existing) {
  static const QRegularExpression suffix(QStringLiteral(" \\(\\d+\\)$"));
  auto base = name;
  base.remove(suffix);
  const QRegularExpression pattern("^" + QRegularExpression::escape(base) + " \\((\\d+)\\)$");
  int highest = 0;
  for (const auto &other : existing) {
    const auto match = pattern.match(other);
    if (match.hasMatch()) { highest = std::max(highest, match.captured(1).toInt()); }
  }
  return QStringLiteral("%1 (%2)").arg(base).arg(highest + 1).left(50);
}
void WorkflowBrowser::setSearch(const QString &text) {
  if (m_search == text) { return; }
  m_search = text;
  emit changed();
}
void WorkflowBrowser::setSortBy(const QString &sortBy) {
  const auto value = sortBy == "name" ? QStringLiteral("name") : QStringLiteral("date");
  if (m_sortBy == value) { return; }
  m_sortBy = value;
  saveViewSettings();
  emit changed();
}
void WorkflowBrowser::setFavoritesOnly(bool only) {
  if (m_favoritesOnly == only) { return; }
  m_favoritesOnly = only;
  emit changed();
}
void WorkflowBrowser::setShowGraphPreview(bool show) {
  if (m_showGraphPreview == show) { return; }
  m_showGraphPreview = show;
  saveViewSettings();
  emit changed();
}
void WorkflowBrowser::setSelectionMode(bool on) {
  if (m_selectionMode == on) { return; }
  m_selectionMode = on;
  if (!on) { m_selected.clear(); }
  emit changed();
}
void WorkflowBrowser::setCurrentId(const QString &id) {
  if (m_current == id) { return; }
  m_current = id;
  emit changed();
}
void WorkflowBrowser::toggleFavorite(const QString &id) {
  if (id.isEmpty()) { return; }
  // The web store and this one both read the stored list first, so a
  // favourite set in another tab is kept.
  if (m_persist) { m_favorites = QSettings().value("workflows/favorites").toStringList(); }
  if (m_favorites.removeAll(id) == 0) { m_favorites.append(id); }
  saveViewSettings();
  emit changed();
}
void WorkflowBrowser::toggleSelected(const QString &id) {
  if (id.isEmpty()) { return; }
  if (m_selected.removeAll(id) == 0) { m_selected.append(id); }
  emit changed();
}
void WorkflowBrowser::toggleTag(const QString &tag) {
  if (tag.isEmpty()) { return; }
  if (m_selectedTags.removeAll(tag) == 0) { m_selectedTags.append(tag); }
  saveViewSettings();
  emit changed();
}
void WorkflowBrowser::clearTags() {
  if (m_selectedTags.isEmpty()) { return; }
  m_selectedTags.clear();
  saveViewSettings();
  emit changed();
}
void WorkflowBrowser::restoreViewSettings() {
  QSettings settings;
  m_persist = true;
  m_favorites = settings.value("workflows/favorites").toStringList();
  m_sortBy = settings.value("workflows/sortBy", "date").toString() == "name" ? "name" : "date";
  m_showGraphPreview = settings.value("workflows/showGraphPreview", false).toBool();
  m_selectedTags = settings.value("workflows/selectedTags").toStringList();
  emit changed();
}
void WorkflowBrowser::saveViewSettings() const {
  if (!m_persist) { return; }
  QSettings settings;
  settings.setValue("workflows/favorites", m_favorites);
  settings.setValue("workflows/sortBy", m_sortBy);
  settings.setValue("workflows/showGraphPreview", m_showGraphPreview);
  settings.setValue("workflows/selectedTags", m_selectedTags);
}
void WorkflowBrowser::setProjectId(const QString &id) {
  if (m_project == id) { return; }
  cancel();
  m_project = id;
  m_rows = {};
  m_next.clear();
  refresh();
}
void WorkflowBrowser::fail(const QString &message) {
  m_error = message;
  m_loading = false;
  m_projectsLoading = false;
  m_busy = false;
  emit changed();
}
void WorkflowBrowser::request(const QByteArray &method, const QString &path,
                              const QJsonObject &body, Result done, bool quiet) {
  if (m_origin.isEmpty()) {
    if (!quiet) { fail(tr("Connect to a server first")); }
    return;
  }
  QNetworkRequest request(m_origin.resolved(QUrl(path)));
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  if (!m_token.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8()); }
  request.setRawHeader("x-user-id", m_user.toUtf8());
  request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  auto reply = m_network.sendCustomRequest(request, method,
      method == "GET" || method == "DELETE" ? QByteArray{} : QJsonDocument(body).toJson(QJsonDocument::Compact));
  const auto epoch = m_epoch;
  connect(reply, &QNetworkReply::readyRead, this, [reply] {
    if (reply->bytesAvailable() > 32 * 1024 * 1024) { reply->abort(); }
  });
  connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, quiet, done = std::move(done)] {
    reply->deleteLater();
    if (epoch != m_epoch) { return; }
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300) {
      if (!quiet) { fail(tr("Server request failed (HTTP %1)").arg(status)); }
      return;
    }
    if (status == 204) { done(QJsonObject{}); return; }
    QJsonParseError error;
    const auto document = QJsonDocument::fromJson(reply->readAll(), &error);
    if (error.error != QJsonParseError::NoError || !document.isObject()) {
      if (!quiet) { fail(tr("Server returned an invalid JSON response")); }
      return;
    }
    done(document.object());
  });
}
void WorkflowBrowser::refresh() {
  if (m_busy) { return; }
  cancel();
  page(false);
}
void WorkflowBrowser::loadTriggers() {
  // WorkflowTriggerIndicator.tsx: a bolt on each workflow with an armed
  // trigger, in the error colour when one failed or the dispatcher disarmed it.
  // The badge is optional, so a failure leaves the list alone. A refresh
  // cancels a pending call, so the owner calls this after it.
  request("GET", "/trpc/jobs.triggersRunning", {}, [this](QJsonValue response) {
    const auto triggers = response.toObject()["result"].toObject()["data"].toObject()["triggers"].toArray();
    QHash<QString, QList<QJsonObject>> byWorkflow;
    for (const auto &trigger : triggers) {
      const auto object = trigger.toObject();
      if (object["workflow_id"].isString()) { byWorkflow[object["workflow_id"].toString()].append(object); }
    }
    QVariantMap badges;
    for (auto it = byWorkflow.cbegin(); it != byWorkflow.cend(); ++it) {
      QJsonObject stopped, failed;
      int armed = 0;
      for (const auto &trigger : it.value()) {
        if (stopped.isEmpty() && trigger["disabled_reason"].isString()) { stopped = trigger; }
        if (trigger["enabled"].toBool()) {
          ++armed;
          if (failed.isEmpty() && trigger["last_error"].isString() && !trigger["last_error"].toString().isEmpty()) { failed = trigger; }
        }
      }
      QString label;
      if (!stopped.isEmpty()) {
        const auto reason = stopped["disabled_reason"].toString();
        label = reason == "failures" ? tr("Trigger disabled after %1 consecutive failures.").arg(5)
              : reason == "expired" ? tr("Trigger disabled because its expiry has passed.")
              : reason == "max_runs" ? tr("Trigger disabled because it reached its run limit.")
              : tr("Trigger disabled.");
      } else if (!failed.isEmpty()) {
        label = tr("Trigger armed, but the last run failed: %1").arg(failed["last_error"].toString());
      } else if (armed == 1) {
        label = tr("Trigger armed");
      } else {
        label = tr("%1 triggers armed").arg(armed);
      }
      badges.insert(it.key(), QVariantMap{{"label", label}, {"failing", !stopped.isEmpty() || !failed.isEmpty()}});
    }
    m_triggers = badges;
    emit changed();
  }, true);
}
void WorkflowBrowser::loadNext() {
  if (!m_loading && !m_busy && hasNext()) { page(true); }
}
void WorkflowBrowser::page(bool append) {
  if (!append) { m_pageCursors.clear(); }
  m_error.clear(); m_loading = true; emit changed();
  QUrlQuery query;
  query.addQueryItem("limit", "100");
  if (!m_project.isEmpty()) { query.addQueryItem("project_id", m_project); }
  if (append) { query.addQueryItem("cursor", m_next); }
  request("GET", "/api/workflows?" + query.toString(QUrl::FullyEncoded), {}, [this, append](QJsonValue response) {
    const auto object = response.toObject();
    if (!object["workflows"].isArray() || (!object["next"].isNull() && !object["next"].isString())) {
      fail(tr("Server returned an invalid workflow page")); return;
    }
    auto rows = append ? m_rows : QJsonArray{};
    QSet<QString> ids;
    for (const auto &row : rows) { ids.insert(row.toObject()["id"].toString()); }
    for (const auto &row : object["workflows"].toArray()) {
      const auto item = row.toObject();
      if (!item["id"].isString() || item["id"].toString().isEmpty() || !item["name"].isString()) {
        fail(tr("Server returned an invalid workflow row")); return;
      }
      if (!ids.contains(item["id"].toString())) { rows.append(item); ids.insert(item["id"].toString()); }
    }
    const auto next = object["next"].toString();
    if (!next.isEmpty() && m_pageCursors.contains(next)) {
      m_next.clear();
      fail(tr("Server repeated its pagination cursor"));
      return;
    }
    if (!next.isEmpty()) { m_pageCursors.insert(next); }
    m_rows = rows; m_next = next; m_loading = false; emit changed();
  });
}
void WorkflowBrowser::loadProjects() {
  if (m_projectsLoading || m_busy || m_loading) { return; }
  m_projectsLoading = true;
  m_error.clear();
  emit changed();
  request("GET", "/trpc/projects.list?input=%7B%7D", {}, [this](QJsonValue response) {
    const QJsonValue data = response.toObject()["result"].toObject()["data"];
    if (!data.isArray()) { fail(tr("Server returned an invalid project list")); return; }
    for (const auto &row : data.toArray()) {
      if (!row.toObject()["id"].isString() || !row.toObject()["name"].isString()) {
        fail(tr("Server returned an invalid project row")); return;
      }
    }
    m_projects = data.toArray(); m_projectsLoading = false; emit changed();
  });
}
bool WorkflowBrowser::mutationReady(const QString &name) {
  if (m_busy || m_loading || m_projectsLoading) { return false; }
  if (name.trimmed().isEmpty()) { fail(tr("Enter a workflow name")); return false; }
  m_busy = true; m_error.clear(); emit changed(); return true;
}
void WorkflowBrowser::createWorkflow(const QString &name) {
  if (!mutationReady(name)) { return; }
  QJsonObject body{{"name", name.trimmed()}, {"access", "private"},
                   {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
  if (!m_project.isEmpty()) { body.insert("project_id", m_project); }
  request("POST", "/api/workflows", body, [this](QJsonValue response) {
    const auto id = response.toObject()["id"].toString();
    if (id.isEmpty()) { fail(tr("Server returned an invalid workflow")); return; }
    m_busy = false; emit created(id); refresh();
  });
}
void WorkflowBrowser::renameWorkflow(const QString &id, const QString &name) {
  if (id.isEmpty() || !mutationReady(name)) { return; }
  const auto path = "/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id));
  request("GET", path, {}, [this, path, id, name](QJsonValue response) {
    auto body = response.toObject();
    if (body["id"].toString() != id || !body["graph"].isObject() || !body["updated_at"].isString()) {
      fail(tr("Server returned an invalid workflow")); return;
    }
    body.insert("name", name.trimmed());
    body.insert("expected_updated_at", body["updated_at"]);
    request("PUT", path, body, [this, id](QJsonValue) {
      m_busy = false; emit renamed(id); refresh();
    });
  });
}
void WorkflowBrowser::deleteWorkflow(const QString &id) {
  if (id.isEmpty() || !mutationReady()) { return; }
  request("DELETE", "/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id)), {}, [this, id](QJsonValue) {
    m_busy = false; m_selected.removeAll(id); emit deleted(id); refresh();
  });
}
void WorkflowBrowser::deleteWorkflows(const QStringList &ids) {
  if (ids.isEmpty() || !mutationReady()) { return; }
  deleteNext(ids, 0);
}
// One DELETE after another. A failed one is counted and the rest still go,
// as WorkflowDeleteDialog.tsx settles every delete before it reports.
void WorkflowBrowser::deleteNext(QStringList ids, int failures) {
  if (ids.isEmpty()) {
    m_busy = false;
    refresh();
    // After refresh(), which clears the error and keeps loading.
    if (failures > 0) { m_error = tr("Failed to delete %n workflow(s)", nullptr, failures); emit changed(); }
    return;
  }
  const auto id = ids.takeFirst();
  QNetworkRequest request(m_origin.resolved(QUrl("/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id)))));
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  if (!m_token.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8()); }
  request.setRawHeader("x-user-id", m_user.toUtf8());
  auto reply = m_network.deleteResource(request);
  const auto epoch = m_epoch;
  connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, id, ids, failures] {
    reply->deleteLater();
    if (epoch != m_epoch) { return; }
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    const bool ok = reply->error() == QNetworkReply::NoError && status >= 200 && status < 300;
    if (ok) { m_selected.removeAll(id); emit deleted(id); }
    deleteNext(ids, failures + (ok ? 0 : 1));
  });
}
void WorkflowBrowser::duplicateWorkflow(const QString &id) {
  if (id.isEmpty() || !mutationReady()) { return; }
  // WorkflowManagerStore copy(): the stored workflow's fields under the next
  // free "Name (n)", private, in the list's project.
  QStringList names;
  for (const auto &row : m_rows) { names.append(row.toObject()["name"].toString()); }
  request("GET", "/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id)), {}, [this, id, names](QJsonValue response) {
    const auto source = response.toObject();
    if (source["id"].toString() != id || !source["graph"].isObject()) { fail(tr("Server returned an invalid workflow")); return; }
    QJsonObject body{{"name", nextCopyName(source["name"].toString(), names)}, {"access", "private"}};
    for (const auto *key : {"description", "thumbnail", "thumbnail_url", "tags", "graph", "settings", "run_mode",
                            "tool_name", "workspace_id", "html_app", "app_doc"}) {
      if (source.contains(key) && !source[key].isNull()) { body.insert(key, source[key]); }
    }
    if (!m_project.isEmpty()) { body.insert("project_id", m_project); }
    else if (source["project_id"].isString()) { body.insert("project_id", source["project_id"]); }
    request("POST", "/api/workflows", body, [this](QJsonValue copy) {
      const auto newId = copy.toObject()["id"].toString();
      if (newId.isEmpty()) { fail(tr("Server returned an invalid workflow")); return; }
      m_busy = false; emit created(newId); refresh();
    });
  });
}
void WorkflowBrowser::updateWorkflow(const QString &id, const QVariantMap &patch) {
  static const QStringList fields{"name", "description", "tags", "run_mode", "tool_name", "workspace_id"};
  QJsonObject changes;
  for (auto it = patch.cbegin(); it != patch.cend(); ++it) {
    if (fields.contains(it.key())) { changes.insert(it.key(), QJsonValue::fromVariant(it.value())); }
  }
  if (changes.contains("name") && changes["name"].toString().trimmed().isEmpty()) { fail(tr("Enter a workflow name")); return; }
  if (id.isEmpty() || changes.isEmpty() || !mutationReady()) { return; }
  if (changes.contains("name")) { changes["name"] = changes["name"].toString().trimmed(); }
  const auto path = "/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id));
  request("GET", path, {}, [this, path, id, changes](QJsonValue response) {
    auto body = response.toObject();
    if (body["id"].toString() != id || !body["graph"].isObject() || !body["updated_at"].isString()) {
      fail(tr("Server returned an invalid workflow")); return;
    }
    for (auto it = changes.constBegin(); it != changes.constEnd(); ++it) { body.insert(it.key(), it.value()); }
    body.insert("expected_updated_at", body["updated_at"]);
    request("PUT", path, body, [this, id](QJsonValue) {
      m_busy = false; emit renamed(id); refresh();
    });
  });
}
}
