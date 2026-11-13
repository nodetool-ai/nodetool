#include "run/BugReport.h"
#include <QUrlQuery>
#include <QtTest>
using namespace nodetool::node_editor;
// The prefilled issue matches web/src/utils/bugReportBundle.ts: title prefix,
// body sections, redaction and length caps.
class BugReportTest : public QObject {
  Q_OBJECT
private slots:
  void redactsCredentialsAndInlineMedia() {
    QCOMPARE(redactSecretsInText("key sk-abcdefghijklmnop1234 failed"), QStringLiteral("key «redacted» failed"));
    QCOMPARE(redactSecretsInText("Authorization: bearer abcdefghijklmnopqrst"), QStringLiteral("Authorization: «redacted»"));
    QCOMPARE(redactSecretsInText("api_key=hunter2hunter2"), QStringLiteral("«redacted»"));
    QCOMPARE(redactSecretsInText("img data:image/png;base64," + QString(120, 'A') + " end"), QStringLiteral("img <inline image/png> end"));
    QCOMPARE(redactSecretsInText("plain error"), QStringLiteral("plain error"));
  }
  void titleNamesTheNodeAndFirstErrorLine() {
    BugReportContext context{.source = "Node error", .errorText = "Model refused\nstack", .nodeType = "openai.text.Summarize"};
    QCOMPARE(bugReportTitle(context), QStringLiteral("[Bug]: openai.text.Summarize: Model refused"));
    QCOMPARE(bugReportTitle({.source = "Error notification"}), QStringLiteral("[Bug]: Error notification"));
    QCOMPARE(bugReportTitle({.source = "x", .errorText = QString(300, 'e')}).size(), 120);
  }
  void bodyCarriesContextAndRedactedError() {
    BugReportContext context{.source = "Node error", .errorText = "token: abcdefghijkl", .nodeType = "a.B", .nodeTitle = "B",
                             .workflowId = "wf", .jobId = "job"};
    const auto body = bugReportBody(context, "Qt 6");
    QVERIFY(body.startsWith("### Describe the bug\n\n(not provided)"));
    QVERIFY(body.contains("Reported from: Node error\nNode: `a.B` (\"B\")\nWorkflow: `wf`\nJob: `job`"));
    QVERIFY(body.contains("### Error\n\n```\n«redacted»\n```"));
    QVERIFY(body.contains("### System information\n\n```\nQt 6\n```"));
    QVERIFY(bugReportBody({.source = "x", .errorText = QString(10000, 'e')}, {}).size() < 6100);
  }
  void urlPrefillsTheBugTemplate() {
    const auto url = bugReportUrl({.source = "Node error", .errorText = "50% & more", .nodeType = "a.B"}, "Qt");
    QCOMPARE(url.host(), QStringLiteral("github.com"));
    QCOMPARE(url.path(), QStringLiteral("/nodetool-ai/nodetool/issues/new"));
    const QUrlQuery query(url);
    QCOMPARE(query.queryItemValue("title", QUrl::FullyDecoded), QStringLiteral("[Bug]: a.B: 50% & more"));
    QCOMPARE(query.queryItemValue("labels"), QStringLiteral("bug"));
    QVERIFY(query.queryItemValue("body", QUrl::FullyDecoded).contains("50% & more"));
  }
};
QTEST_GUILESS_MAIN(BugReportTest)
#include "BugReportTest.moc"
