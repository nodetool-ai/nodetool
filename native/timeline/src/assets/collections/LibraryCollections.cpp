#include "LibraryCollections.h"
#include "app/Preferences/PreferencesSettings.h"

#include <QCryptographicHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSet>
#include <QSettings>
#include <QUuid>

namespace {
constexpr qsizetype MaxCollections = 256;
constexpr qsizetype MaxAssets = 10000;
constexpr qsizetype MaxPayloadBytes = 8 * 1024 * 1024;
bool validText(const QString &text, qsizetype maxLength) {
  if (text.isEmpty() || text.size() > maxLength) {
    return false;
  }
  for (const auto ch : text) {
    if (ch.isNull() || ch.category() == QChar::Other_Control) {
      return false;
    }
  }
  return true;
}
} // namespace

LibraryCollections::LibraryCollections(QObject *parent) : QObject(parent) {}

QString LibraryCollections::settingsKey() const {
  return QStringLiteral("libraryCollections/v1/") +
         QString::fromLatin1(QCryptographicHash::hash(
                                 m_scope.toUtf8(), QCryptographicHash::Sha256)
                                 .toHex());
}

void LibraryCollections::setError(const QString &error) {
  if (m_error != error) {
    m_error = error;
    emit errorChanged();
  }
}

QVariantList LibraryCollections::collections() const {
  QVariantList rows;
  for (const auto &row : m_collections) {
    rows.append(QVariantMap{
        {"id", row.id}, {"name", row.name}, {"assetIds", row.assetIds}});
  }
  return rows;
}

QStringList LibraryCollections::assetIds() const {
  for (const auto &row : m_collections) {
    if (row.id == m_selectedId) {
      return row.assetIds;
    }
  }
  return {};
}

void LibraryCollections::setScope(const QString &scope) {
  if (scope == m_scope) {
    return;
  }
  m_scope = scope;
  m_collections.clear();
  m_selectedId.clear();
  setError({});
  if (!scope.isEmpty()) {
    const auto settings = nt::app::openTimelinePreferences();
    const auto bytes = settings->value(settingsKey()).toByteArray();
    if (settings->contains(settingsKey())) {
      const auto doc = bytes.size() <= MaxPayloadBytes
                           ? QJsonDocument::fromJson(bytes)
                           : QJsonDocument{};
      const auto root = doc.object();
      const auto rows = root.value("collections").toArray();
      bool valid = doc.isObject() && root.value("version").toInt(-1) == 1 &&
                   root.value("collections").isArray() &&
                   rows.size() <= MaxCollections;
      QSet<QString> seen;
      for (const auto &value : rows) {
        if (!valid) {
          break;
        }
        const auto row = value.toObject();
        Collection collection{
            row.value("id").toString(), row.value("name").toString(), {}};
        const auto ids = row.value("assetIds").toArray();
        valid = value.isObject() && validText(collection.id, 4096) &&
                validText(collection.name, 256) &&
                !collection.name.trimmed().isEmpty() &&
                !seen.contains(collection.id) &&
                row.value("assetIds").isArray() && ids.size() <= MaxAssets;
        seen.insert(collection.id);
        QSet<QString> assets;
        for (const auto &id : ids) {
          if (!id.isString() || !validText(id.toString(), 4096)) {
            valid = false;
            break;
          }
          if (!assets.contains(id.toString())) {
            assets.insert(id.toString());
            collection.assetIds.append(id.toString());
          }
        }
        m_collections.append(collection);
      }
      if (!valid) {
        m_collections.clear();
        setError(QStringLiteral("Saved collections could not be read."));
      }
    }
  }
  emit scopeChanged();
  emit selectedIdChanged();
  emit collectionsChanged();
  emit assetIdsChanged();
}

void LibraryCollections::setSelectedId(const QString &id) {
  if (id == m_selectedId) {
    return;
  }
  if (!id.isEmpty()) {
    bool found = false;
    for (const auto &row : m_collections) {
      found = found || row.id == id;
    }
    if (!found) {
      setError(QStringLiteral("Collection no longer exists."));
      return;
    }
  }
  m_selectedId = id;
  setError({});
  emit selectedIdChanged();
  emit assetIdsChanged();
}

bool LibraryCollections::commit(const QList<Collection> &collections) {
  if (m_scope.isEmpty()) {
    setError(QStringLiteral("Open a library before saving collections."));
    return false;
  }
  QJsonArray rows;
  for (const auto &row : collections) {
    rows.append(
        QJsonObject{{"id", row.id},
                    {"name", row.name},
                    {"assetIds", QJsonArray::fromStringList(row.assetIds)}});
  }
  const auto bytes =
      QJsonDocument(QJsonObject{{"version", 1}, {"collections", rows}})
          .toJson(QJsonDocument::Compact);
  if (bytes.size() > MaxPayloadBytes) {
    setError(QStringLiteral("Collections exceed the local storage limit."));
    return false;
  }
  const auto settings = nt::app::openTimelinePreferences();
  settings->setValue(settingsKey(), bytes);
  settings->sync();
  if (settings->status() != QSettings::NoError) {
    setError(QStringLiteral("Collections could not be saved."));
    return false;
  }
  m_collections = collections;
  setError({});
  emit collectionsChanged();
  emit assetIdsChanged();
  return true;
}

QString LibraryCollections::create(const QString &name) {
  const auto trimmed = name.trimmed();
  if (!validText(trimmed, 256) || m_collections.size() >= MaxCollections) {
    setError(QStringLiteral("Enter a collection name of up to 256 characters. "
                            "The limit is 256 collections."));
    return {};
  }
  const auto id = QUuid::createUuid().toString(QUuid::Id128);
  auto rows = m_collections;
  rows.append({id, trimmed, {}});
  return commit(rows) ? id : QString{};
}

bool LibraryCollections::rename(const QString &id, const QString &name) {
  const auto trimmed = name.trimmed();
  if (!validText(trimmed, 256)) {
    setError(
        QStringLiteral("Enter a collection name of up to 256 characters."));
    return false;
  }
  auto rows = m_collections;
  for (auto &row : rows) {
    if (row.id == id) {
      row.name = trimmed;
      return commit(rows);
    }
  }
  setError(QStringLiteral("Collection no longer exists."));
  return false;
}

bool LibraryCollections::remove(const QString &id) {
  auto rows = m_collections;
  for (qsizetype i = 0; i < rows.size(); ++i) {
    if (rows[i].id == id) {
      rows.removeAt(i);
      if (!commit(rows)) {
        return false;
      }
      if (m_selectedId == id) {
        setSelectedId({});
      }
      return true;
    }
  }
  setError(QStringLiteral("Collection no longer exists."));
  return false;
}

bool LibraryCollections::changeAssets(const QString &id, const QStringList &ids,
                                      bool adding) {
  if (ids.size() > MaxAssets) {
    setError(QStringLiteral("Select up to 10000 assets at a time."));
    return false;
  }
  QSet<QString> requested;
  for (const auto &asset : ids) {
    if (!validText(asset, 4096)) {
      setError(QStringLiteral("Asset identifiers must be nonempty strings of "
                              "up to 4096 characters."));
      return false;
    }
    requested.insert(asset);
  }
  auto rows = m_collections;
  for (auto &row : rows) {
    if (row.id != id) {
      continue;
    }
    if (adding) {
      QSet<QString> existing(row.assetIds.begin(), row.assetIds.end());
      for (const auto &asset : ids) {
        if (!existing.contains(asset)) {
          existing.insert(asset);
          row.assetIds.append(asset);
        }
      }
    } else {
      row.assetIds.removeIf([&requested](const QString &asset) {
        return requested.contains(asset);
      });
    }
    if (row.assetIds.size() > MaxAssets) {
      setError(QStringLiteral("A collection can contain up to 10000 assets."));
      return false;
    }
    return commit(rows);
  }
  setError(QStringLiteral("Collection no longer exists."));
  return false;
}

bool LibraryCollections::addAssets(const QString &id, const QStringList &ids) {
  return changeAssets(id, ids, true);
}
bool LibraryCollections::removeAssets(const QString &id,
                                      const QStringList &ids) {
  return changeAssets(id, ids, false);
}
