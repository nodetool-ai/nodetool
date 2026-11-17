#include "ProjectFiles.h"

#include <QDesktopServices>
#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocale>
#include <QMimeDatabase>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QUrlQuery>
#include <algorithm>

namespace nodetool::files {
namespace {
constexpr qint64 ResponseLimit = 16 * 1024 * 1024;
// A timeline larger than this shows no summary rather than parse on the UI thread.
constexpr qint64 TimelineLimit = 2 * 1024 * 1024;
constexpr auto Root = ".";
// NodeTool's own data at the folder root (isReservedProjectEntry in
// the web projectFolderPaths.ts).
constexpr auto Reserved = ".nodetool";

// workspaceFileKind.ts and the languages of the web assetLanguage.ts.
const QHash<QString, QString> &mediaKinds() {
  static const QHash<QString, QString> kinds = [] {
    QHash<QString, QString> map;
    for (const auto *ext : {"png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "ico", "tif", "tiff", "svg"}) { map.insert(ext, "image"); }
    for (const auto *ext : {"mp3", "wav", "ogg", "oga", "flac", "m4a", "aac", "opus"}) { map.insert(ext, "audio"); }
    for (const auto *ext : {"mp4", "webm", "mov", "m4v", "mkv", "avi"}) { map.insert(ext, "video"); }
    map.insert("pdf", "pdf");
    for (const auto *ext : {"glb", "gltf", "obj", "fbx", "stl", "ply", "usdz"}) { map.insert(ext, "model3d"); }
    return map;
  }();
  return kinds;
}
// Extensions with a Monaco language other than plain text.
const QSet<QString> &codeExtensions() {
  static const QSet<QString> extensions{
      "js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "json", "jsonc", "css", "scss", "less", "html", "htm", "xml",
      "yaml", "yml", "sh", "bash", "zsh", "sql", "toml", "ini", "cfg", "conf", "env", "rs", "go", "java", "kt",
      "c", "h", "cpp", "cc", "hpp", "cs", "rb", "php", "swift", "graphql", "gql"};
  return extensions;
}
const QSet<QString> &textBasenames() {
  static const QSet<QString> names{"license", "licence", "readme", "changelog", "authors", "contributing",
                                   "notice", "copying", "makefile", "dockerfile", "procfile"};
  return names;
}
QString iconOf(const QString &kind) {
  static const QHash<QString, QString> icons{
      {"folder", "folderOutlined"}, {"image", "image"}, {"audio", "audiotrack"}, {"video", "movie"},
      {"pdf", "article"}, {"model3d", "viewInAr"}, {"markdown", "editNote"}, {"csv", "dataArray"},
      {"code", "code"}, {"text", "descriptionOutlined"}, {"binary", "dataObject"}};
  return icons.value(kind, "descriptionOutlined");
}
}  // namespace

ProjectFiles::ProjectFiles(QObject *parent) : QAbstractListModel(parent), m_network(this) {
  connect(this, &ProjectFiles::selectionChanged, this, &ProjectFiles::updatePreview);
}

ProjectFiles::~ProjectFiles() { clearRequests(); }

void ProjectFiles::configure(const QUrl &origin, const QString &token, const QString &userId) {
  clearRequests();
  m_network.clearAccessCache();
  m_network.setCookieJar(new QNetworkCookieJar(&m_network));  // m_network owns the jar.
  m_origin = origin;
  m_token = token;
  m_user = userId;
  const auto workspace = m_workspace;
  m_workspace.clear();
  setFolder(workspace, m_localPath);
}

void ProjectFiles::setFolder(const QString &workspaceId, const QString &localPath) {
  const bool pathChanged = localPath != m_localPath;
  m_localPath = localPath;
  if (workspaceId == m_workspace) {
    if (pathChanged) { emit folderChanged(); }
    return;
  }
  clearRequests();
  m_workspace = workspaceId;
  m_listings.clear();
  m_staged.clear();
  m_expanded.clear();
  m_rootError.clear();
  m_selected.clear();
  m_refreshAgain = false;
  beginResetModel();
  m_rows.clear();
  endResetModel();
  if (hasFolder() && !m_origin.isEmpty()) {
    m_listings.insert(Root, {});
    m_rootTicket = list(Root);
  }
  emit folderChanged();
  emit countChanged();
  emit selectionChanged();
  emit stateChanged();
}

bool ProjectFiles::revealable() const {
  return hasFolder() && !m_localPath.isEmpty() && QFileInfo(m_localPath).isDir();
}

QString ProjectFiles::revealLabel() {
#if defined(Q_OS_MACOS)
  return tr("Reveal in Finder");
#elif defined(Q_OS_WIN)
  return tr("Show in File Explorer");
#else
  return tr("Show in file manager");
#endif
}

bool ProjectFiles::loading() const {
  if (!hasFolder() || m_origin.isEmpty()) { return false; }
  const auto root = m_listings.constFind(Root);
  return root == m_listings.cend() || root->state == Listing::Loading;
}

QString ProjectFiles::error() const {
  const auto root = m_listings.constFind(Root);
  return root != m_listings.cend() && root->state == Listing::Failed ? m_rootError : QString();
}

bool ProjectFiles::empty() const {
  const auto root = m_listings.constFind(Root);
  return root != m_listings.cend() && root->state == Listing::Loaded && root->entries.isEmpty();
}

int ProjectFiles::rowCount(const QModelIndex &parent) const { return parent.isValid() ? 0 : int(m_rows.size()); }

QVariant ProjectFiles::data(const QModelIndex &index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= m_rows.size()) { return {}; }
  const auto &row = m_rows.at(index.row());
  switch (role) {
  case PathRole: return row.path;
  case Qt::DisplayRole:
  case NameRole: return row.name;
  case DepthRole: return row.depth;
  case IsDirRole: return row.isDir;
  case ExpandedRole: return row.isDir && m_expanded.contains(row.path);
  case PlaceholderRole: return row.placeholder;
  case KindRole: return row.kind;
  case IconRole: return row.icon;
  // Only image rows load a picture. The others leave the Image source empty.
  case ThumbnailUrlRole: return row.kind == QLatin1String("image") ? downloadUrl(m_origin, m_workspace, row.path) : QUrl();
  case SelectedRole: return !row.placeholder && row.path == m_selected;
  default: return {};
  }
}

QHash<int, QByteArray> ProjectFiles::roleNames() const {
  return {{PathRole, "path"},           {NameRole, "name"},   {DepthRole, "depth"},
          {IsDirRole, "isDir"},         {ExpandedRole, "expanded"}, {PlaceholderRole, "placeholder"},
          {KindRole, "kind"},           {IconRole, "iconName"},   {ThumbnailUrlRole, "thumbnailUrl"},
          {SelectedRole, "selected"}};
}

int ProjectFiles::naturalCompare(QStringView a, QStringView b) {
  // Runs of digits compare by value, so "2" sorts before "10". Other text
  // compares case-insensitively. QCollator's numeric mode does neither in the
  // C locale, so the order is computed here.
  qsizetype i = 0, j = 0;
  while (i < a.size() && j < b.size()) {
    if (a.at(i).isDigit() && b.at(j).isDigit()) {
      const auto si = i, sj = j;
      while (i < a.size() && a.at(i).isDigit()) { ++i; }
      while (j < b.size() && b.at(j).isDigit()) { ++j; }
      auto left = a.mid(si, i - si), right = b.mid(sj, j - sj);
      while (left.size() > 1 && left.front() == u'0') { left = left.mid(1); }
      while (right.size() > 1 && right.front() == u'0') { right = right.mid(1); }
      if (left.size() != right.size()) { return left.size() < right.size() ? -1 : 1; }
      if (const int order = left.compare(right); order != 0) { return order < 0 ? -1 : 1; }
      continue;
    }
    const auto si = i, sj = j;
    while (i < a.size() && !a.at(i).isDigit()) { ++i; }
    while (j < b.size() && !b.at(j).isDigit()) { ++j; }
    if (const int order = a.mid(si, i - si).compare(b.mid(sj, j - sj), Qt::CaseInsensitive); order != 0) { return order < 0 ? -1 : 1; }
  }
  return a.size() - i == b.size() - j ? 0 : (a.size() - i < b.size() - j ? -1 : 1);
}

QString ProjectFiles::kindOf(const QString &name) {
  const auto base = name.section('/', -1).toLower();
  const auto dot = base.lastIndexOf('.');
  const auto media = dot > 0 ? mediaKinds().value(base.mid(dot + 1)) : QString();
  if (!media.isEmpty()) { return media; }
  // assetLanguage.ts takes the text after the last dot even for a dotfile.
  const auto language = base.contains('.') ? base.section('.', -1) : QString();
  if (language == QLatin1String("md") || language == QLatin1String("markdown")) { return "markdown"; }
  if (base.endsWith(".csv") || base.endsWith(".tsv")) { return "csv"; }
  if (base == QLatin1String("dockerfile") || codeExtensions().contains(language)) { return "code"; }
  const auto ext = dot > 0 ? base.mid(dot + 1) : QString();
  return ext == QLatin1String("txt") || ext == QLatin1String("log") || base.startsWith('.') || textBasenames().contains(base)
             ? QStringLiteral("text")
             : QStringLiteral("binary");
}

QString ProjectFiles::previewKindOf(const QString &name) {
  const auto base = name.section('/', -1).toLower();
  if (base.endsWith(QLatin1String(".timeline.json"))) { return QStringLiteral("timeline"); }
  if (base.endsWith(QLatin1String(".workflow.json"))) { return QStringLiteral("workflow"); }
  const auto kind = kindOf(base);
  static const QSet<QString> media{"image", "video", "audio", "model3d"};
  return media.contains(kind) ? kind : QString();
}

QString ProjectFiles::formatSize(qint64 bytes) {
  if (bytes < 1024) { return QStringLiteral("%1 B").arg(std::max<qint64>(0, bytes)); }
  static const char *units[] = {"KB", "MB", "GB", "TB"};
  double value = double(bytes);
  int unit = -1;
  while (value >= 1024 && unit < 3) {
    value /= 1024;
    ++unit;
  }
  return QStringLiteral("%1 %2").arg(QString::number(value, 'f', 1), QLatin1String(units[unit]));
}

QString ProjectFiles::formatDuration(qint64 ms) {
  const qint64 total = std::max<qint64>(0, (ms + 500) / 1000);
  return QStringLiteral("%1:%2").arg(total / 60).arg(total % 60, 2, 10, QLatin1Char('0'));
}

QString ProjectFiles::timelineSummary(const QJsonObject &timeline) {
  const auto document = timeline.value("document").toObject();
  const auto tracks = document.value("tracks").toArray().size();
  const auto clips = document.value("clips").toArray().size();
  return tr("%1 · %2 %3 · %4 %5")
      .arg(formatDuration(qint64(timeline.value("duration_ms").toDouble())))
      .arg(tracks)
      .arg(tracks == 1 ? tr("track") : tr("tracks"))
      .arg(clips)
      .arg(clips == 1 ? tr("clip") : tr("clips"));
}

QUrl ProjectFiles::previewImageUrl() const {
  return m_preview.kind == QLatin1String("image") ? downloadUrl(m_origin, m_workspace, m_preview.path) : QUrl();
}

QUrl ProjectFiles::previewMediaUrl() const {
  static const QSet<QString> playable{"video", "audio", "model3d"};
  if (!playable.contains(m_preview.kind)) { return {}; }
  if (!m_localPath.isEmpty() && QFileInfo(m_localPath).isDir()) {
    const auto file = QDir(m_localPath).filePath(QDir::cleanPath(m_preview.path));
    if (QFileInfo(file).canonicalFilePath().startsWith(QFileInfo(m_localPath).canonicalFilePath() + '/')) {
      return QUrl::fromLocalFile(file);
    }
  }
  return downloadUrl(m_origin, m_workspace, m_preview.path);
}

void ProjectFiles::updatePreview() {
  Preview next;
  const int row = indexOfPath(m_selected);
  const auto kind = row >= 0 && !m_rows.at(row).isDir ? previewKindOf(m_rows.at(row).name) : QString();
  if (!kind.isEmpty()) {
    const auto &entry = m_rows.at(row);
    next.path = entry.path;
    next.kind = kind;
    next.name = entry.name;
    next.size = entry.size;
    next.icon = kind == QLatin1String("timeline") ? QStringLiteral("movie")
                : kind == QLatin1String("workflow") ? QStringLiteral("accountTree")
                                                    : iconOf(kind);
    QString type;
    if (kind == QLatin1String("timeline")) {
      type = tr("Timeline");
    } else if (kind == QLatin1String("workflow")) {
      type = tr("Workflow");
    } else {
      type = QMimeDatabase().mimeTypeForFile(entry.name, QMimeDatabase::MatchExtension).name();
    }
    next.details = formatSize(entry.size) + QStringLiteral(" · ") + type;
    // The same file at the same size keeps the summary it has.
    if (next.path == m_preview.path && next.size == m_preview.size) { next.summary = m_preview.summary; }
  }
  if (next == m_preview) { return; }
  const bool reread = next.kind == QLatin1String("timeline") && (next.path != m_preview.path || next.size != m_preview.size);
  m_preview = next;
  m_timelineTicket = 0;
  if (reread && next.size <= TimelineLimit && !m_origin.isEmpty()) {
    m_timelineTicket = ++m_nextTicket;
    requestTimeline(m_timelineTicket, next.path);
  }
  emit previewChanged();
}

void ProjectFiles::receiveTimeline(quint64 ticket, const QJsonObject &timeline, const QString &error) {
  if (ticket == 0 || ticket != m_timelineTicket) { return; }
  m_timelineTicket = 0;
  if (!error.isEmpty() || timeline.isEmpty()) { return; }
  m_preview.summary = timelineSummary(timeline);
  emit previewChanged();
}

QUrl ProjectFiles::downloadUrl(const QUrl &origin, const QString &workspaceId, const QString &path) {
  if (origin.isEmpty() || workspaceId.isEmpty() || path.isEmpty()) { return {}; }
  QByteArray encoded = "/api/workspaces/" + QUrl::toPercentEncoding(workspaceId) + "/download";
  for (const auto &segment : QDir::cleanPath(path).split('/', Qt::SkipEmptyParts)) {
    if (segment == QLatin1String(".")) { continue; }
    encoded += '/' + QUrl::toPercentEncoding(segment);
  }
  auto url = origin;
  url.setPath(QString::fromLatin1(encoded), QUrl::TolerantMode);
  url.setQuery(QString());
  url.setFragment(QString());
  return url;
}

QVector<ProjectFiles::Entry> ProjectFiles::entriesOf(const QJsonArray &entries, bool root) const {
  QVector<Entry> result;
  result.reserve(entries.size());
  for (const auto &value : entries) {
    const auto object = value.toObject();
    Entry entry;
    entry.path = object.value("path").toString();
    entry.name = object.value("name").toString();
    if (entry.path.isEmpty() || (root && entry.path == QLatin1String(Reserved))) { continue; }
    if (entry.name.isEmpty()) { entry.name = entry.path.section('/', -1); }
    entry.isDir = object.value("is_dir").toBool();
    entry.size = qint64(object.value("size").toDouble());
    entry.kind = entry.isDir ? QStringLiteral("folder") : kindOf(entry.name);
    entry.icon = iconOf(entry.kind);
    result.append(std::move(entry));
  }
  // Folders first, then names in natural, case-insensitive order: 2 before 10.
  std::sort(result.begin(), result.end(), [](const Entry &a, const Entry &b) {
    if (a.isDir != b.isDir) { return a.isDir; }
    const int order = naturalCompare(a.name, b.name);
    return order != 0 ? order < 0 : a.name < b.name;
  });
  return result;
}

void ProjectFiles::appendChildren(QVector<Row> &rows, const QString &dir, int depth) const {
  const auto listing = m_listings.constFind(dir);
  if (listing == m_listings.cend() || listing->state == Listing::Loading) {
    rows.append({dir + "/", tr("Loading…"), "loading", {}, depth, false, true});
    return;
  }
  if (listing->state == Listing::Failed) {
    rows.append({dir + "/", tr("Access denied"), "error", "warning", depth, false, true});
    return;
  }
  for (const auto &entry : listing->entries) {
    rows.append({entry.path, entry.name, entry.kind, entry.icon, depth, entry.isDir, false, entry.size});
    if (entry.isDir && m_expanded.contains(entry.path)) { appendChildren(rows, entry.path, depth + 1); }
  }
}

QVector<ProjectFiles::Row> ProjectFiles::buildRows() const {
  QVector<Row> rows;
  const auto root = m_listings.constFind(Root);
  if (root == m_listings.cend() || root->state != Listing::Loaded) { return rows; }
  appendChildren(rows, Root, 0);
  return rows;
}

void ProjectFiles::resetRows() {
  beginResetModel();
  m_rows = buildRows();
  endResetModel();
  emit countChanged();
  emit selectionChanged();
}

int ProjectFiles::childEnd(int row) const {
  const int depth = m_rows.at(row).depth;
  int end = row + 1;
  while (end < m_rows.size() && m_rows.at(end).depth > depth) { ++end; }
  return end;
}

int ProjectFiles::indexOfPath(const QString &path) const {
  if (path.isEmpty()) { return -1; }
  for (int i = 0; i < m_rows.size(); ++i) {
    if (!m_rows.at(i).placeholder && m_rows.at(i).path == path) { return i; }
  }
  return -1;
}

void ProjectFiles::replaceChildren(int row) {
  const auto path = m_rows.at(row).path;
  const int end = childEnd(row);
  if (end > row + 1) {
    beginRemoveRows({}, row + 1, end - 1);
    m_rows.remove(row + 1, end - row - 1);
    endRemoveRows();
  }
  QVector<Row> children;
  appendChildren(children, path, m_rows.at(row).depth + 1);
  if (!children.isEmpty()) {
    beginInsertRows({}, row + 1, row + int(children.size()));
    m_rows.insert(row + 1, children.size(), {});
    std::move(children.begin(), children.end(), m_rows.begin() + row + 1);
    endInsertRows();
  }
  emit countChanged();
  emit selectionChanged();
}

void ProjectFiles::emitRowChanged(int row, const QList<int> &roles) {
  if (row < 0 || row >= m_rows.size()) { return; }
  const auto at = index(row);
  emit dataChanged(at, at, roles);
}

void ProjectFiles::setSelected(const QString &path) {
  if (path == m_selected) { return; }
  const int previous = indexOfPath(m_selected);
  m_selected = path;
  emitRowChanged(previous, {SelectedRole});
  emitRowChanged(indexOfPath(path), {SelectedRole});
  emit selectionChanged();
}

void ProjectFiles::select(int row) {
  if (row < 0 || row >= m_rows.size() || m_rows.at(row).placeholder) { return; }
  setSelected(m_rows.at(row).path);
}

void ProjectFiles::click(int row) {
  if (row < 0 || row >= m_rows.size() || m_rows.at(row).placeholder) { return; }
  select(row);
  if (m_rows.at(row).isDir) { toggle(row); }
}

void ProjectFiles::activate(int row) {
  if (row < 0 || row >= m_rows.size() || m_rows.at(row).placeholder) { return; }
  const auto &target = m_rows.at(row);
  if (target.isDir) {
    setExpanded(row, true);
    return;
  }
  emit openFileRequested(target.path);
}

void ProjectFiles::toggle(int row) {
  if (row < 0 || row >= m_rows.size()) { return; }
  setExpanded(row, !m_expanded.contains(m_rows.at(row).path));
}

void ProjectFiles::setExpanded(int row, bool expanded) {
  if (row < 0 || row >= m_rows.size() || !m_rows.at(row).isDir || m_rows.at(row).placeholder) { return; }
  const auto path = m_rows.at(row).path;
  if (expanded == m_expanded.contains(path)) { return; }
  if (!expanded) {
    m_expanded.remove(path);
    emitRowChanged(row, {ExpandedRole});
    const int end = childEnd(row);
    if (end > row + 1) {
      beginRemoveRows({}, row + 1, end - 1);
      m_rows.remove(row + 1, end - row - 1);
      endRemoveRows();
      emit countChanged();
      emit selectionChanged();
    }
    return;
  }
  m_expanded.insert(path);
  emitRowChanged(row, {ExpandedRole});
  // The first expand lists the folder. A failed one tries again.
  const auto listing = m_listings.constFind(path);
  if (listing == m_listings.cend() || listing->state == Listing::Failed) {
    m_listings.insert(path, {});
    list(path);
  }
  replaceChildren(row);
}

void ProjectFiles::moveSelection(int delta) {
  if (m_rows.isEmpty() || delta == 0) { return; }
  const int step = delta > 0 ? 1 : -1;
  int row = selectedRow();
  row = row < 0 ? (step > 0 ? 0 : int(m_rows.size()) - 1) : row + delta;
  row = std::clamp(row, 0, int(m_rows.size()) - 1);
  // Placeholder rows take no selection.
  while (row >= 0 && row < m_rows.size() && m_rows.at(row).placeholder) { row += step; }
  if (row >= 0 && row < m_rows.size()) { select(row); }
}

void ProjectFiles::expandSelected() {
  const int row = selectedRow();
  if (row < 0 || !m_rows.at(row).isDir) { return; }
  if (!m_expanded.contains(m_rows.at(row).path)) {
    setExpanded(row, true);
  } else if (row + 1 < m_rows.size() && m_rows.at(row + 1).depth > m_rows.at(row).depth) {
    select(row + 1);
  }
}

void ProjectFiles::collapseSelected() {
  const int row = selectedRow();
  if (row < 0) { return; }
  if (m_rows.at(row).isDir && m_expanded.contains(m_rows.at(row).path)) {
    setExpanded(row, false);
    return;
  }
  for (int parent = row - 1; parent >= 0; --parent) {
    if (m_rows.at(parent).depth < m_rows.at(row).depth) {
      select(parent);
      return;
    }
  }
}

void ProjectFiles::reveal(const QString &path) {
  if (!revealable()) { return; }
  const QDir root(m_localPath);
  const auto relative = QDir::cleanPath(path.isEmpty() ? QStringLiteral(".") : path);
  if (QDir::isAbsolutePath(relative) || relative == QLatin1String("..") || relative.startsWith(QLatin1String("../"))) { return; }
  const QFileInfo target(root.filePath(relative));
  QDesktopServices::openUrl(QUrl::fromLocalFile(target.isDir() ? target.absoluteFilePath() : target.absolutePath()));
}

void ProjectFiles::refresh() {
  if (!hasFolder() || m_origin.isEmpty()) { return; }
  if (!m_refreshTickets.isEmpty()) {
    m_refreshAgain = true;
    return;
  }
  m_refreshAgain = false;
  m_staged.clear();
  // The root listing a refresh replaces needs no answer of its own.
  if (m_rootTicket != 0) {
    m_pending.remove(m_rootTicket);
    m_rootTicket = 0;
  }
  m_refreshTickets.insert(list(Root));
  for (const auto &path : std::as_const(m_expanded)) { m_refreshTickets.insert(list(path)); }
  emit stateChanged();
}

void ProjectFiles::workspaceFilesChanged(const QString &workspaceId) {
  if (!workspaceId.isEmpty() && workspaceId != m_workspace) { return; }
  refresh();
}

quint64 ProjectFiles::list(const QString &path) {
  const auto ticket = ++m_nextTicket;
  m_pending.insert(ticket, path);
  requestListing(ticket, path);
  return ticket;
}

void ProjectFiles::clearRequests() {
  m_pending.clear();
  m_timelineTicket = 0;
  m_refreshTickets.clear();
  m_rootTicket = 0;
  for (auto *reply : m_network.findChildren<QNetworkReply *>()) {
    reply->disconnect(this);
    reply->abort();
    reply->deleteLater();
  }
}

void ProjectFiles::receiveListing(quint64 ticket, const QJsonArray &entries, const QString &error) {
  const auto found = m_pending.constFind(ticket);
  if (found == m_pending.cend()) { return; }
  const auto path = *found;
  m_pending.erase(found);
  const bool root = path == QLatin1String(Root);
  Listing listing;
  listing.state = error.isEmpty() ? Listing::Loaded : Listing::Failed;
  if (error.isEmpty()) { listing.entries = entriesOf(entries, root); }
  if (root) { m_rootError = error; }

  if (m_refreshTickets.remove(ticket)) {
    m_staged.insert(path, std::move(listing));
    if (!m_refreshTickets.isEmpty()) { return; }
    // Every listing of the refresh is back: apply them at once. A folder still
    // loading for its first expand keeps its request.
    for (auto it = m_listings.cbegin(); it != m_listings.cend(); ++it) {
      if (it->state == Listing::Loading && !m_staged.contains(it.key())) { m_staged.insert(it.key(), *it); }
    }
    m_listings = std::move(m_staged);
    m_staged.clear();
    resetRows();
    // A folder that is gone is no longer expanded. One under a closed parent keeps its state.
    QSet<QString> present;
    for (const auto &kept : std::as_const(m_listings)) {
      for (const auto &entry : kept.entries) {
        if (entry.isDir && m_expanded.contains(entry.path)) { present.insert(entry.path); }
      }
    }
    m_expanded = present;
    if (indexOfPath(m_selected) < 0) { setSelected({}); }
    emit stateChanged();
    if (m_refreshAgain) { refresh(); }
    return;
  }
  m_listings.insert(path, std::move(listing));
  if (ticket == m_rootTicket) {
    m_rootTicket = 0;
    resetRows();
    emit stateChanged();
    return;
  }
  const int row = indexOfPath(path);
  if (row >= 0 && m_expanded.contains(path)) { replaceChildren(row); }
}

void ProjectFiles::requestListing(quint64 ticket, const QString &path) {
  auto url = m_origin.resolved(QUrl("/trpc/workspace.listFiles"));
  QUrlQuery query;
  query.addQueryItem("input", QString::fromUtf8(QJsonDocument(QJsonObject{{"id", m_workspace}, {"path", path}})
                                                    .toJson(QJsonDocument::Compact)));
  url.setQuery(query);
  QNetworkRequest request(url);
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  if (!m_token.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8()); }
  if (!m_user.isEmpty()) { request.setRawHeader("x-user-id", m_user.toUtf8()); }
  auto *reply = m_network.get(request);  // m_network owns the reply until deleteLater.
  connect(reply, &QNetworkReply::readyRead, reply, [reply] {
    if (reply->bytesAvailable() > ResponseLimit) { reply->abort(); }
  });
  connect(reply, &QNetworkReply::finished, this, [this, reply, ticket] {
    reply->deleteLater();
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    const auto envelope = QJsonDocument::fromJson(reply->readAll()).object();
    if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300) {
      auto failure = envelope["error"].toObject();
      if (failure["json"].isObject()) { failure = failure["json"].toObject(); }
      const auto message = failure["message"].toString();
      receiveListing(ticket, {}, message.isEmpty() ? tr("HTTP %1").arg(status) : message);
      return;
    }
    auto data = envelope["result"].toObject()["data"];
    if (data.isObject() && data.toObject().contains("json")) { data = data.toObject()["json"]; }
    receiveListing(ticket, data.toArray(), data.isArray() ? QString() : tr("Invalid response"));
  });
}

void ProjectFiles::requestTimeline(quint64 ticket, const QString &path) {
  QNetworkRequest request(downloadUrl(m_origin, m_workspace, path));
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  if (!m_token.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8()); }
  if (!m_user.isEmpty()) { request.setRawHeader("x-user-id", m_user.toUtf8()); }
  auto *reply = m_network.get(request);  // m_network owns the reply until deleteLater.
  connect(reply, &QNetworkReply::readyRead, reply, [reply] {
    if (reply->bytesAvailable() > TimelineLimit) { reply->abort(); }
  });
  connect(reply, &QNetworkReply::finished, this, [this, reply, ticket] {
    reply->deleteLater();
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300) {
      receiveTimeline(ticket, {}, tr("HTTP %1").arg(status));
      return;
    }
    receiveTimeline(ticket, QJsonDocument::fromJson(reply->readAll()).object(), {});
  });
}
}  // namespace nodetool::files
