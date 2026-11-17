#pragma once
#include "ProjectFiles.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QVector>

// ProjectFiles with a scripted reply source in place of the server. Each
// listing request is recorded, and the test answers it with answer().
// UI thread only.
class FakeProjectFiles : public nodetool::files::ProjectFiles {
public:
  struct Request {
    quint64 ticket = 0;
    QString path;
  };
  using ProjectFiles::ProjectFiles;
  QVector<Request> requests;

  // Answers the oldest open request for a path.
  bool answer(const QString &path, const QJsonArray &entries, const QString &error = {}) {
    for (int i = 0; i < requests.size(); ++i) {
      if (requests.at(i).path == path) {
        const auto ticket = requests.takeAt(i).ticket;
        receiveListing(ticket, entries, error);
        return true;
      }
    }
    return false;
  }

  static QJsonObject entry(const QString &path, bool dir = false) {
    return {{"name", path.section('/', -1)}, {"path", path}, {"size", 0}, {"is_dir", dir}, {"modified_at", "2026-11-16T00:00:00Z"}};
  }

protected:
  void requestListing(quint64 ticket, const QString &path) override { requests.append({ticket, path}); }
};
