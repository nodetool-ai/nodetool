// ProjectFiles and FilesPanel.qml with a scripted reply source: no server.
// The tree follows the web WorkspaceTree.tsx.
#include "FakeProjectFiles.h"

#include <QElapsedTimer>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QTemporaryDir>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>
#include <algorithm>

Q_IMPORT_QML_PLUGIN(NodeTool_FilesPlugin)

using nodetool::files::ProjectFiles;

namespace {
const QUrl Origin("http://127.0.0.1:9");

QStringList names(const ProjectFiles &files) {
  QStringList result;
  for (int i = 0; i < files.rowCount(); ++i) { result.append(files.index(i).data(ProjectFiles::NameRole).toString()); }
  return result;
}

QVariant role(const ProjectFiles &files, int row, int which) { return files.index(row).data(which); }

int rowOf(const ProjectFiles &files, const QString &path) {
  for (int i = 0; i < files.rowCount(); ++i) {
    if (role(files, i, ProjectFiles::PathRole).toString() == path && !role(files, i, ProjectFiles::PlaceholderRole).toBool()) { return i; }
  }
  return -1;
}

void open(FakeProjectFiles &files, const QJsonArray &root) {
  files.configure(Origin, "token", "user");
  files.setFolder("ws1");
  QVERIFY(files.answer(".", root));
}

QQuickItem *named(QQuickItem *root, const QString &name) {
  if (root->objectName() == name) { return root; }
  for (auto *child : root->childItems()) {
    if (auto *found = named(child, name)) { return found; }
  }
  return nullptr;
}

QList<QQuickItem *> rows(QQuickItem *list) {
  QList<QQuickItem *> result;
  const auto content = qobject_cast<QQuickItem *>(list->property("contentItem").value<QObject *>());
  for (auto *child : content->childItems()) {
    if (child->objectName() == QLatin1String("files-row") && child->isVisible() && !child->property("pooled").toBool()) { result.append(child); }
  }
  return result;
}

QQuickItem *rowItem(QQuickItem *list, const QString &path) {
  for (auto *row : rows(list)) {
    if (row->property("path").toString() == path) { return row; }
  }
  return nullptr;
}

QPoint centerOf(QQuickItem *item) { return item->mapToScene({item->width() / 2, item->height() / 2}).toPoint(); }

std::unique_ptr<QQuickView> panel(ProjectFiles &files, QSize size = {320, 480}) {
  auto view = std::make_unique<QQuickView>();
  view->setInitialProperties({{"files", QVariant::fromValue(&files)}});
  view->loadFromModule("NodeTool.Files", "FilesPanel");
  view->setResizeMode(QQuickView::SizeRootObjectToView);
  view->resize(size);
  view->show();
  return view;
}

double median(QVector<double> values) {
  std::sort(values.begin(), values.end());
  return values.isEmpty() ? 0 : values.at(values.size() / 2);
}
}  // namespace

class FilesTest : public QObject {
  Q_OBJECT
private slots:
  void sortsFoldersFirstInNaturalOrderAndHidesReservedEntry() {
    FakeProjectFiles files;
    files.configure(Origin, "token", "user");
    files.setFolder("ws1");
    QCOMPARE(files.requests.size(), 1);
    QCOMPARE(files.requests.first().path, QStringLiteral("."));
    QVERIFY(files.loading());
    QVERIFY(files.answer(".", {FakeProjectFiles::entry("b.txt"), FakeProjectFiles::entry("10.png"),
                               FakeProjectFiles::entry("Beta", true), FakeProjectFiles::entry(".nodetool", true),
                               FakeProjectFiles::entry("2.png"), FakeProjectFiles::entry("alpha", true),
                               FakeProjectFiles::entry("B.md")}));
    QVERIFY(!files.loading());
    QCOMPARE(names(files), (QStringList{"alpha", "Beta", "2.png", "10.png", "B.md", "b.txt"}));
    QCOMPARE(role(files, 0, ProjectFiles::KindRole).toString(), QStringLiteral("folder"));
    QCOMPARE(role(files, 2, ProjectFiles::KindRole).toString(), QStringLiteral("image"));
    QCOMPARE(role(files, 2, ProjectFiles::ThumbnailUrlRole).toUrl(), QUrl("http://127.0.0.1:9/api/workspaces/ws1/download/2.png"));
    QVERIFY(role(files, 5, ProjectFiles::ThumbnailUrlRole).toUrl().isEmpty());
    // .nodetool is reserved at the root only.
    files.toggle(0);
    QVERIFY(files.answer("alpha", {FakeProjectFiles::entry("alpha/.nodetool", true)}));
    QCOMPARE(names(files).at(1), QStringLiteral(".nodetool"));
  }

  void comparesNamesNaturally() {
    QVERIFY(ProjectFiles::naturalCompare(u"2.png", u"10.png") < 0);
    QVERIFY(ProjectFiles::naturalCompare(u"file 9", u"File 10") < 0);
    QVERIFY(ProjectFiles::naturalCompare(u"a", u"B") < 0);
    QVERIFY(ProjectFiles::naturalCompare(u"img007", u"img7") == 0);
    QVERIFY(ProjectFiles::naturalCompare(u"img", u"img1") < 0);
    QVERIFY(ProjectFiles::naturalCompare(u"z", u"a") > 0);
  }

  void classifiesFilesAsTheWebDoes() {
    const QList<QPair<QString, QString>> cases{
        {"a.PNG", "image"}, {"x/y.svg", "image"}, {"s.flac", "audio"}, {"m.mkv", "video"}, {"d.pdf", "pdf"},
        {"m.glb", "model3d"}, {"r.md", "markdown"}, {"t.tsv", "csv"}, {"c.ts", "code"}, {"Dockerfile", "code"},
        {".env", "code"}, {"n.txt", "text"}, {"LICENSE", "text"}, {".gitignore", "text"}, {"z.bin", "binary"},
        {"noext", "binary"}};
    for (const auto &[name, kind] : cases) { QCOMPARE(ProjectFiles::kindOf(name), kind); }
  }

  void encodesEachDownloadSegment() {
    QCOMPARE(ProjectFiles::downloadUrl(QUrl("http://localhost:7777"), "w s", "my dir/a b#?.png").toString(QUrl::FullyEncoded),
             QStringLiteral("http://localhost:7777/api/workspaces/w%20s/download/my%20dir/a%20b%23%3F.png"));
  }

  void firstExpandShowsLoadingThenReplacesItWithoutReset() {
    FakeProjectFiles files;
    open(files, {FakeProjectFiles::entry("a", true), FakeProjectFiles::entry("z.txt")});
    QSignalSpy resets(&files, &QAbstractItemModel::modelReset);
    QSignalSpy inserted(&files, &QAbstractItemModel::rowsInserted);
    QSignalSpy removed(&files, &QAbstractItemModel::rowsRemoved);
    files.click(0);
    QCOMPARE(files.selectedPath(), QStringLiteral("a"));
    QVERIFY(role(files, 0, ProjectFiles::ExpandedRole).toBool());
    QCOMPARE(files.rowCount(), 3);
    QVERIFY(role(files, 1, ProjectFiles::PlaceholderRole).toBool());
    QCOMPARE(role(files, 1, ProjectFiles::NameRole).toString(), QStringLiteral("Loading…"));
    QCOMPARE(role(files, 1, ProjectFiles::DepthRole).toInt(), 1);
    QCOMPARE(inserted.size(), 1);
    QCOMPARE(inserted.first().at(1).toInt(), 1);
    QCOMPARE(inserted.first().at(2).toInt(), 1);
    QCOMPARE(files.requests.size(), 1);
    QVERIFY(files.answer("a", {FakeProjectFiles::entry("a/2.png"), FakeProjectFiles::entry("a/10.png"), FakeProjectFiles::entry("a/sub", true)}));
    QCOMPARE(names(files), (QStringList{"a", "sub", "2.png", "10.png", "z.txt"}));
    QCOMPARE(removed.size(), 1);
    QCOMPARE(inserted.size(), 2);
    QCOMPARE(inserted.last().at(1).toInt(), 1);
    QCOMPARE(inserted.last().at(2).toInt(), 3);
    // Collapse removes the child range only, and a second expand lists nothing.
    files.toggle(0);
    QCOMPARE(names(files), (QStringList{"a", "z.txt"}));
    QCOMPARE(removed.last().at(1).toInt(), 1);
    QCOMPARE(removed.last().at(2).toInt(), 3);
    files.toggle(0);
    QCOMPARE(files.rowCount(), 5);
    QVERIFY(files.requests.isEmpty());
    QCOMPARE(resets.size(), 0);
  }

  void failedFolderShowsOneErrorRowAndRetries() {
    FakeProjectFiles files;
    open(files, {FakeProjectFiles::entry("locked", true)});
    files.toggle(0);
    QVERIFY(files.answer("locked", {}, "Path traversal not allowed"));
    QCOMPARE(files.rowCount(), 2);
    QCOMPARE(role(files, 1, ProjectFiles::NameRole).toString(), QStringLiteral("Access denied"));
    QCOMPARE(role(files, 1, ProjectFiles::KindRole).toString(), QStringLiteral("error"));
    QVERIFY(role(files, 1, ProjectFiles::PlaceholderRole).toBool());
    files.toggle(0);
    files.toggle(0);
    QCOMPARE(files.requests.size(), 1);
    QVERIFY(files.answer("locked", {FakeProjectFiles::entry("locked/f.txt")}));
    QCOMPARE(names(files), (QStringList{"locked", "f.txt"}));
  }

  void rootFailureAndEmptyFolderAreStates() {
    FakeProjectFiles files;
    files.configure(Origin, {}, {});
    QVERIFY(!files.hasFolder());
    QVERIFY(files.requests.isEmpty());
    files.setFolder("ws1");
    QVERIFY(files.answer(".", {}, "Directory not found"));
    QCOMPARE(files.error(), QStringLiteral("Directory not found"));
    files.refresh();
    QVERIFY(files.answer(".", {FakeProjectFiles::entry(".nodetool", true)}));
    QVERIFY(files.error().isEmpty());
    QVERIFY(files.empty());
    QCOMPARE(files.rowCount(), 0);
  }

  void refreshRelistsExpandedFoldersAndKeepsExpansion() {
    FakeProjectFiles files;
    open(files, {FakeProjectFiles::entry("a", true), FakeProjectFiles::entry("b", true)});
    files.toggle(0);
    QVERIFY(files.answer("a", {FakeProjectFiles::entry("a/inner", true)}));
    files.toggle(1);
    QVERIFY(files.answer("a/inner", {FakeProjectFiles::entry("a/inner/deep.txt")}));
    files.select(rowOf(files, "a/inner/deep.txt"));
    // b was listed and closed: a refresh forgets it and lists it on the next expand.
    files.toggle(rowOf(files, "b"));
    QVERIFY(files.answer("b", {}));
    files.toggle(rowOf(files, "b"));
    QSignalSpy resets(&files, &QAbstractItemModel::modelReset);
    files.workspaceFilesChanged("other");
    QVERIFY(files.requests.isEmpty());
    files.workspaceFilesChanged("ws1");
    QVERIFY(files.busy());
    QStringList asked;
    for (const auto &request : std::as_const(files.requests)) { asked.append(request.path); }
    asked.sort();
    QCOMPARE(asked, (QStringList{".", "a", "a/inner"}));
    QVERIFY(files.answer("a/inner", {FakeProjectFiles::entry("a/inner/deep.txt"), FakeProjectFiles::entry("a/inner/new.txt")}));
    QVERIFY(files.answer(".", {FakeProjectFiles::entry("a", true), FakeProjectFiles::entry("b", true)}));
    QCOMPARE(resets.size(), 0);
    QVERIFY(files.answer("a", {FakeProjectFiles::entry("a/inner", true)}));
    QCOMPARE(resets.size(), 1);
    QVERIFY(!files.busy());
    QCOMPARE(names(files), (QStringList{"a", "inner", "deep.txt", "new.txt", "b"}));
    QCOMPARE(files.selectedPath(), QStringLiteral("a/inner/deep.txt"));
    files.toggle(rowOf(files, "b"));
    QCOMPARE(files.requests.size(), 1);
    QCOMPARE(files.requests.first().path, QStringLiteral("b"));
  }

  void refreshDropsAFolderThatIsGone() {
    FakeProjectFiles files;
    open(files, {FakeProjectFiles::entry("a", true)});
    files.toggle(0);
    QVERIFY(files.answer("a", {FakeProjectFiles::entry("a/f.txt")}));
    files.refresh();
    QVERIFY(files.answer("a", {}, "Directory not found"));
    QVERIFY(files.answer(".", {FakeProjectFiles::entry("c.txt")}));
    QCOMPARE(names(files), QStringList{"c.txt"});
    QVERIFY(files.selectedPath().isEmpty());
  }

  void dropsRepliesForAnEarlierFolder() {
    FakeProjectFiles files;
    files.configure(Origin, {}, {});
    files.setFolder("ws1");
    const auto stale = files.requests.takeFirst();
    files.setFolder("ws2");
    files.receiveListing(stale.ticket, {FakeProjectFiles::entry("old.txt")}, {});
    QVERIFY(files.loading());
    QCOMPARE(files.rowCount(), 0);
    QVERIFY(files.answer(".", {FakeProjectFiles::entry("new.txt")}));
    QCOMPARE(names(files), QStringList{"new.txt"});
    files.setFolder({});
    QVERIFY(!files.hasFolder());
    QCOMPARE(files.rowCount(), 0);
  }

  void keyboardMovesOpensAndClosesFolders() {
    FakeProjectFiles files;
    open(files, {FakeProjectFiles::entry("a", true), FakeProjectFiles::entry("x.txt")});
    QSignalSpy opened(&files, &ProjectFiles::openFileRequested);
    files.moveSelection(1);
    QCOMPARE(files.selectedPath(), QStringLiteral("a"));
    files.expandSelected();
    // The placeholder takes no selection.
    files.moveSelection(1);
    QCOMPARE(files.selectedPath(), QStringLiteral("x.txt"));
    QVERIFY(files.answer("a", {FakeProjectFiles::entry("a/one.txt")}));
    files.select(0);
    files.expandSelected();
    QCOMPARE(files.selectedPath(), QStringLiteral("a/one.txt"));
    files.collapseSelected();
    QCOMPARE(files.selectedPath(), QStringLiteral("a"));
    files.collapseSelected();
    QCOMPARE(names(files), (QStringList{"a", "x.txt"}));
    files.activate(0);
    QVERIFY(opened.isEmpty());
    QCOMPARE(files.rowCount(), 3);
    files.activate(rowOf(files, "x.txt"));
    QCOMPARE(opened.size(), 1);
    QCOMPARE(opened.first().first().toString(), QStringLiteral("x.txt"));
  }

  void panelShowsStatesAndRows() {
    FakeProjectFiles files;
    files.configure(Origin, {}, {});
    auto view = panel(files);
    QVERIFY2(view->rootObject(), "FilesPanel did not load");
    auto *root = view->rootObject();
    QVERIFY(named(root, "files-no-folder")->isVisible());
    files.setFolder("ws1");
    QVERIFY(!named(root, "files-no-folder")->isVisible());
    QVERIFY(named(root, "files-loading")->isVisible());
    QVERIFY(files.answer(".", {}));
    QVERIFY(named(root, "files-empty")->isVisible());
    files.refresh();
    QVERIFY(files.answer(".", {FakeProjectFiles::entry("pics", true), FakeProjectFiles::entry("a.png"), FakeProjectFiles::entry("notes.md")}));
    auto *list = named(root, "files-list");
    QVERIFY(list->isVisible());
    QVERIFY(!named(root, "files-empty")->isVisible());
    QTRY_COMPARE(rows(list).size(), 3);

    // A click selects and opens a folder, with a Loading row under it.
    QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, centerOf(rowItem(list, "pics")));
    QCOMPARE(files.selectedPath(), QStringLiteral("pics"));
    QTRY_COMPARE(rows(list).size(), 4);
    QVERIFY(list->hasActiveFocus());
    QVERIFY(files.answer("pics", {FakeProjectFiles::entry("pics/b.png")}));
    QTRY_VERIFY(rowItem(list, "pics/b.png"));
    auto *child = rowItem(list, "pics/b.png");
    QVERIFY(named(child, "files-name")->x() > named(rowItem(list, "pics"), "files-name")->x());
    QCOMPARE(named(child, "files-thumbnail")->property("source").toUrl(), QUrl("http://127.0.0.1:9/api/workspaces/ws1/download/pics/b.png"));
    QVERIFY(named(child, "files-thumbnail")->property("asynchronous").toBool());
    QVERIFY(named(rowItem(list, "notes.md"), "files-thumbnail")->property("source").toUrl().isEmpty());
    QCOMPARE(named(rowItem(list, "notes.md"), "files-kind-icon")->property("name").toString(), QStringLiteral("editNote"));
    QCOMPARE(named(rowItem(list, "pics"), "files-chevron")->rotation(), 90.0);

    // Keys: Down, Enter opens a file, Left goes back to the folder and closes it.
    QSignalSpy opened(&files, &ProjectFiles::openFileRequested);
    QTest::keyClick(view.get(), Qt::Key_Down);
    QCOMPARE(files.selectedPath(), QStringLiteral("pics/b.png"));
    QTest::keyClick(view.get(), Qt::Key_Return);
    QCOMPARE(opened.size(), 1);
    QTest::keyClick(view.get(), Qt::Key_Left);
    QCOMPARE(files.selectedPath(), QStringLiteral("pics"));
    QTest::keyClick(view.get(), Qt::Key_Left);
    QTRY_COMPARE(rows(list).size(), 3);
    QTest::keyClick(view.get(), Qt::Key_Right);
    QTRY_COMPARE(rows(list).size(), 4);

    // A double click opens a file.
    QTest::mouseDClick(view.get(), Qt::LeftButton, Qt::NoModifier, centerOf(rowItem(list, "notes.md")));
    QCOMPARE(opened.size(), 2);
    QCOMPARE(opened.last().first().toString(), QStringLiteral("notes.md"));

    // The reveal menu needs a folder on this machine.
    QVERIFY(!files.revealable());
    QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, centerOf(rowItem(list, "a.png")));
    QVERIFY(!named(root, "files-menu") || !named(root, "files-menu")->isVisible());
    QTemporaryDir local;
    files.setFolder("ws1", local.path());
    QVERIFY(files.revealable());
    auto *menu = root->findChild<QObject *>("files-menu");
    QVERIFY(menu);
    QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, centerOf(rowItem(list, "a.png")));
    QTRY_VERIFY(menu->property("visible").toBool());
    QCOMPARE(menu->property("path").toString(), QStringLiteral("a.png"));
    QCOMPARE(files.selectedPath(), QStringLiteral("a.png"));

    // Close asks the host.
    QSignalSpy closed(root, SIGNAL(closeRequested()));
    QTest::keyClick(view.get(), Qt::Key_Escape);
    QTRY_VERIFY(!menu->property("visible").toBool());
    QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, centerOf(named(root, "files-close")));
    QCOMPARE(closed.size(), 1);
  }

  void previewKindsFollowTheWebPreview() {
    QCOMPARE(ProjectFiles::previewKindOf("a.PNG"), QStringLiteral("image"));
    QCOMPARE(ProjectFiles::previewKindOf("clip.mov"), QStringLiteral("video"));
    QCOMPARE(ProjectFiles::previewKindOf("song.wav"), QStringLiteral("audio"));
    QCOMPARE(ProjectFiles::previewKindOf("chair.glb"), QStringLiteral("model3d"));
    QCOMPARE(ProjectFiles::previewKindOf("Timelines/Cut.timeline.json"), QStringLiteral("timeline"));
    QCOMPARE(ProjectFiles::previewKindOf("Workflows/Flow.workflow.json"), QStringLiteral("workflow"));
    QCOMPARE(ProjectFiles::previewKindOf("data.json"), QString());
    QCOMPARE(ProjectFiles::previewKindOf("notes.md"), QString());
    QCOMPARE(ProjectFiles::previewKindOf("doc.pdf"), QString());
    QCOMPARE(ProjectFiles::formatSize(0), QStringLiteral("0 B"));
    QCOMPARE(ProjectFiles::formatSize(512), QStringLiteral("512 B"));
    QCOMPARE(ProjectFiles::formatSize(1536), QStringLiteral("1.5 KB"));
    QCOMPARE(ProjectFiles::formatSize(3 * 1024 * 1024), QStringLiteral("3.0 MB"));
    QCOMPARE(ProjectFiles::formatDuration(64000), QStringLiteral("1:04"));
    QCOMPARE(ProjectFiles::formatDuration(-5), QStringLiteral("0:00"));
  }

  void previewFollowsTheSelection() {
    FakeProjectFiles files;
    open(files, {FakeProjectFiles::entry("Timelines", true), FakeProjectFiles::entry("a.png", false, 2048),
                 FakeProjectFiles::entry("Cut.timeline.json", false, 900), FakeProjectFiles::entry("notes.md")});
    QSignalSpy changed(&files, &ProjectFiles::previewChanged);
    QCOMPARE(files.previewKind(), QString());

    files.select(rowOf(files, "a.png"));
    QCOMPARE(files.previewKind(), QStringLiteral("image"));
    QCOMPARE(files.previewName(), QStringLiteral("a.png"));
    QCOMPARE(files.previewDetails(), QStringLiteral("2.0 KB · image/png"));
    QCOMPARE(files.previewImageUrl(), ProjectFiles::downloadUrl(Origin, "ws1", "a.png"));
    QVERIFY(files.timelineRequests.isEmpty());

    // A timeline reads its file once for the summary.
    files.select(rowOf(files, "Cut.timeline.json"));
    QCOMPARE(files.previewKind(), QStringLiteral("timeline"));
    QCOMPARE(files.previewDetails(), QStringLiteral("900 B · Timeline"));
    QCOMPARE(files.previewImageUrl(), QUrl());
    QCOMPARE(files.previewSummary(), QString());
    QCOMPARE(files.timelineRequests.size(), 1);
    QCOMPARE(files.timelineRequests.first().path, QStringLiteral("Cut.timeline.json"));
    const QJsonObject timeline{{"duration_ms", 64000},
                               {"document", QJsonObject{{"tracks", QJsonArray{QJsonObject{}, QJsonObject{}}},
                                                        {"clips", QJsonArray{QJsonObject{}}}}}};
    QVERIFY(files.answerTimeline(timeline));
    QCOMPARE(files.previewSummary(), QStringLiteral("1:04 · 2 tracks · 1 clip"));

    // A refresh with the same size keeps the summary and reads nothing.
    files.refresh();
    QVERIFY(files.answer(".", {FakeProjectFiles::entry("Timelines", true), FakeProjectFiles::entry("a.png", false, 2048),
                               FakeProjectFiles::entry("Cut.timeline.json", false, 900), FakeProjectFiles::entry("notes.md")}));
    QCOMPARE(files.previewSummary(), QStringLiteral("1:04 · 2 tracks · 1 clip"));
    QVERIFY(files.timelineRequests.isEmpty());

    // A read that answers after the selection moved on is dropped.
    files.select(rowOf(files, "a.png"));
    files.select(rowOf(files, "Cut.timeline.json"));
    QCOMPARE(files.timelineRequests.size(), 1);
    const auto stale = files.timelineRequests.takeFirst();
    files.select(rowOf(files, "a.png"));
    files.timelineRequests.append(stale);
    QVERIFY(files.answerTimeline(timeline));
    QCOMPARE(files.previewSummary(), QString());

    // A file or folder without a preview hides it.
    files.select(rowOf(files, "notes.md"));
    QCOMPARE(files.previewKind(), QString());
    files.select(rowOf(files, "Timelines"));
    QCOMPARE(files.previewKind(), QString());
    QVERIFY(changed.size() > 0);
  }

  void panelShowsThePreviewOfTheSelection() {
    FakeProjectFiles files;
    open(files, {FakeProjectFiles::entry("clip.mp4", false, 4096), FakeProjectFiles::entry("notes.md")});
    auto view = panel(files);
    auto *root = view->rootObject();
    QVERIFY2(root, "FilesPanel did not load");
    QVERIFY(QTest::qWaitForWindowExposed(view.get()));
    auto *preview = named(root, "files-preview");
    QVERIFY(preview);
    QVERIFY(!preview->isVisible());

    files.select(rowOf(files, "clip.mp4"));
    QTRY_VERIFY(preview->isVisible());
    QCOMPARE(named(root, "files-preview-name")->property("text").toString(), QStringLiteral("clip.mp4"));
    QCOMPARE(named(root, "files-preview-details")->property("text").toString(), QStringLiteral("4.0 KB · video/mp4"));
    QVERIFY(named(root, "files-preview-glyph")->isVisible());
    QVERIFY(!named(root, "files-preview-summary")->isVisible());
    auto *media = named(root, "files-preview-media");
    QVERIFY(media->isVisible());
    QVERIFY(media->height() > 0);
    // The tree keeps its rows above the preview.
    auto *list = named(root, "files-list");
    QVERIFY(list->height() > 0);
    QTRY_VERIFY2(list->mapToScene({0, list->height()}).y() <= preview->mapToScene({0, 0}).y() + 0.5,
                 qPrintable(QStringLiteral("list bottom %1, preview top %2, preview height %3")
                                .arg(list->mapToScene({0, list->height()}).y())
                                .arg(preview->mapToScene({0, 0}).y())
                                .arg(preview->height())));

    // The section collapses to its header.
    QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, centerOf(named(preview, "sectionToggle")));
    QTRY_VERIFY(!media->isVisible());
    QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, centerOf(named(preview, "sectionToggle")));
    QTRY_VERIFY(media->isVisible());

    files.select(rowOf(files, "notes.md"));
    QTRY_VERIFY(!preview->isVisible());
  }

  void previewMediaUrlPicksTheLocalFileOrTheDownload() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    QFile clip(dir.filePath("clip.mp4"));
    QVERIFY(clip.open(QIODevice::WriteOnly));
    clip.close();
    FakeProjectFiles files;
    files.configure(Origin, "token", "user");
    files.setFolder("ws1", dir.path());
    QVERIFY(files.answer(".", {FakeProjectFiles::entry("clip.mp4", false, 10), FakeProjectFiles::entry("song.wav", false, 10),
                               FakeProjectFiles::entry("a.png", false, 10)}));
    files.select(rowOf(files, "clip.mp4"));
    QCOMPARE(files.previewMediaUrl(), QUrl::fromLocalFile(QDir(dir.path()).filePath("clip.mp4")));
    // The file is not on disk, so the server serves it.
    files.select(rowOf(files, "song.wav"));
    QCOMPARE(files.previewMediaUrl(), ProjectFiles::downloadUrl(Origin, "ws1", "song.wav"));
    files.select(rowOf(files, "a.png"));
    QCOMPARE(files.previewMediaUrl(), QUrl());
  }

  void previewDelegatePlaysVideoAndAudio() {
    FakeProjectFiles files;
    open(files, {FakeProjectFiles::entry("clip.mp4", false, 4096), FakeProjectFiles::entry("song.wav", false, 10),
                 FakeProjectFiles::entry("chair.glb", false, 10)});
    auto view = panel(files);
    auto *root = view->rootObject();
    QVERIFY2(root, "FilesPanel did not load");
    QQmlComponent player(view->engine());
    player.setData("import QtQuick\nItem { objectName: \"host-player\"; property url source; property string kind }", {});
    QVERIFY2(player.isReady(), qPrintable(player.errorString()));
    root->setProperty("previewDelegate", QVariant::fromValue(&player));
    QVERIFY(QTest::qWaitForWindowExposed(view.get()));

    files.select(rowOf(files, "clip.mp4"));
    QQuickItem *hosted = nullptr;
    QTRY_VERIFY((hosted = named(root, "host-player")) && hosted->isVisible());
    QCOMPARE(hosted->property("kind").toString(), QStringLiteral("video"));
    QCOMPARE(hosted->property("source").toUrl(), ProjectFiles::downloadUrl(Origin, "ws1", "clip.mp4"));
    QTRY_VERIFY(hosted->width() > 0 && hosted->height() > 0);
    QVERIFY(!named(root, "files-preview-glyph")->isVisible());

    files.select(rowOf(files, "song.wav"));
    QTRY_COMPARE(named(root, "host-player")->property("kind").toString(), QStringLiteral("audio"));
    QCOMPARE(named(root, "host-player")->property("source").toUrl(), ProjectFiles::downloadUrl(Origin, "ws1", "song.wav"));

    // A kind the host does not play keeps the glyph.
    files.select(rowOf(files, "chair.glb"));
    QTRY_VERIFY(!named(root, "host-player"));
    QVERIFY(named(root, "files-preview-glyph")->isVisible());
  }

  void previewWithoutDelegateShowsTheGlyph() {
    FakeProjectFiles files;
    open(files, {FakeProjectFiles::entry("clip.mp4", false, 4096)});
    auto view = panel(files);
    auto *root = view->rootObject();
    QVERIFY2(root, "FilesPanel did not load");
    QVERIFY(QTest::qWaitForWindowExposed(view.get()));
    files.select(rowOf(files, "clip.mp4"));
    QTRY_VERIFY(named(root, "files-preview")->isVisible());
    QVERIFY(named(root, "files-preview-glyph")->isVisible());
    QVERIFY(!named(root, "files-preview-player")->property("active").toBool());
  }

  // The performance contract: a 5,000-entry folder with 3,000 images builds
  // about a screen of delegates, and a toggle inserts or removes rows
  // without resetting the model. Prints the measured times.
  void benchFiveThousandEntries() {
    QJsonArray root;
    for (int i = 0; i < 20; ++i) { root.append(FakeProjectFiles::entry(QStringLiteral("folder %1").arg(i), true)); }
    for (int i = 0; i < 3000; ++i) { root.append(FakeProjectFiles::entry(QStringLiteral("image %1.png").arg(i))); }
    for (int i = 0; i < 1980; ++i) { root.append(FakeProjectFiles::entry(QStringLiteral("note %1.txt").arg(i))); }
    QJsonArray children;
    for (int i = 0; i < 200; ++i) { children.append(FakeProjectFiles::entry(QStringLiteral("folder 0/frame %1.png").arg(i))); }

    FakeProjectFiles files;
    files.configure(Origin, {}, {});
    files.setFolder("ws1");
    auto view = panel(files, {320, 600});
    auto *list = named(view->rootObject(), "files-list");
    QVERIFY2(view->rootObject(), "FilesPanel did not load");
    QVERIFY(QTest::qWaitForWindowExposed(view.get()));

    QElapsedTimer timer;
    timer.start();
    QVERIFY(files.answer(".", root));
    const double listed = timer.nsecsElapsed() / 1e6;
    view->grabWindow();
    const double firstFrame = timer.nsecsElapsed() / 1e6;
    QCOMPARE(files.rowCount(), 5000);

    const double rowHeight = rows(list).first()->height();
    const int screen = int(std::ceil(list->height() / rowHeight));
    const auto content = qobject_cast<QQuickItem *>(list->property("contentItem").value<QObject *>());
    // Shown delegates, and every delegate the view holds, pooled ones included.
    const auto delegates = [content](bool all) {
      return int(std::count_if(content->childItems().cbegin(), content->childItems().cend(), [all](QQuickItem *item) {
        return item->objectName() == QLatin1String("files-row") && (all || (item->isVisible() && !item->property("pooled").toBool()));
      }));
    };
    const auto check = [&](const char *when) {
      // The view builds its cache buffer in later frames, so let them run first.
      QTest::qWait(200);
      view->grabWindow();
      qInfo("files bench: %s: %d rows, %d-row screen, %d shown delegates, %d held", when, files.rowCount(), screen,
            delegates(false), delegates(true));
      // A screen of rows plus the four-row cache buffer and one partial row at each edge.
      QVERIFY2(delegates(false) <= screen + 4 + 2, when);
      // The reuse pool keeps at most about another screen.
      QVERIFY2(delegates(true) <= 2 * (screen + 4 + 2), when);
    };
    check("loaded");

    QSignalSpy resets(&files, &QAbstractItemModel::modelReset);
    QSignalSpy inserted(&files, &QAbstractItemModel::rowsInserted);
    QSignalSpy removed(&files, &QAbstractItemModel::rowsRemoved);
    files.toggle(0);
    QVERIFY(files.answer("folder 0", children));
    view->grabWindow();
    QVector<double> toggles;
    for (int i = 0; i < 21; ++i) {
      timer.restart();
      files.toggle(0);
      view->grabWindow();
      toggles.append(timer.nsecsElapsed() / 1e6);
    }
    QCOMPARE(resets.size(), 0);
    QVERIFY(inserted.size() >= 10);
    QVERIFY(removed.size() >= 10);
    check("after 21 toggles");

    // Scroll to the middle: the view keeps the same delegate budget.
    QVector<double> scrolls;
    for (int i = 0; i < 21; ++i) {
      timer.restart();
      list->setProperty("contentY", (i + 1) * rowHeight * 100);
      view->grabWindow();
      scrolls.append(timer.nsecsElapsed() / 1e6);
    }
    check("after scrolling");
    qInfo("files bench: root listing applied %.2f ms, first frame %.2f ms", listed, firstFrame);
    qInfo("files bench: toggle 200-row folder + frame median %.2f ms (max %.2f ms)", median(toggles), *std::max_element(toggles.cbegin(), toggles.cend()));
    qInfo("files bench: scroll 100 rows + frame median %.2f ms (max %.2f ms)", median(scrolls), *std::max_element(scrolls.cbegin(), scrolls.cend()));
  }
};

QTEST_MAIN(FilesTest)
#include "tst_files.moc"
