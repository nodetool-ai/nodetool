#include "run/BugReport.h"
#include <QRegularExpression>
#include <QStringList>
#include <QUrlQuery>

namespace nodetool::node_editor {
namespace {
constexpr auto issueUrl = "https://github.com/nodetool-ai/nodetool/issues/new";
// GitHub rejects very long URLs, so the body stops here as on the web.
constexpr qsizetype maxBodyChars = 6000;
constexpr qsizetype maxErrorChars = 1500;
constexpr qsizetype maxTitleChars = 120;

QString orNotProvided(const QString &text) { return text.isEmpty() ? QStringLiteral("(not provided)") : text; }
}  // namespace

QString redactSecretsInText(const QString &text) {
  static const QList<QRegularExpression> patterns{
      QRegularExpression(QStringLiteral(R"(\bsk-[A-Za-z0-9_-]{16,})")),
      QRegularExpression(QStringLiteral(R"(\bgh[pousr]_[A-Za-z0-9]{20,})")),
      QRegularExpression(QStringLiteral(R"(\bxox[baprs]-[A-Za-z0-9-]{10,})")),
      QRegularExpression(QStringLiteral(R"(\bAKIA[0-9A-Z]{16}\b)")),
      QRegularExpression(QStringLiteral(R"(\bAIza[A-Za-z0-9_-]{30,}\b)")),
      QRegularExpression(QStringLiteral(R"(\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})")),
      QRegularExpression(QStringLiteral(R"(\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*)"), QRegularExpression::CaseInsensitiveOption),
      QRegularExpression(QStringLiteral(R"re(\b(api[_-]?key|secret|token|password|credential)["'\s]*[:=]["'\s]*[^\s"',}]{8,})re"),
                         QRegularExpression::CaseInsensitiveOption)};
  static const QRegularExpression dataUri(QStringLiteral(R"(data:([\w/+.-]+)?(;base64)?,[A-Za-z0-9+/=]{100,})"));
  auto result = text;
  for (const auto &pattern : patterns) { result.replace(pattern, QStringLiteral("«redacted»")); }
  QString out;
  qsizetype last = 0;
  for (auto it = dataUri.globalMatch(result); it.hasNext();) {
    const auto match = it.next();
    out += result.mid(last, match.capturedStart() - last);
    const auto mime = match.captured(1);
    out += QStringLiteral("<inline %1>").arg(mime.isEmpty() ? QStringLiteral("data") : mime);
    last = match.capturedEnd();
  }
  return out + result.mid(last);
}

QString bugReportTitle(const BugReportContext &context) {
  auto subject = context.summary;
  if (subject.isEmpty()) { subject = context.errorText.section(QLatin1Char('\n'), 0, 0); }
  if (subject.isEmpty()) { subject = context.source; }
  const auto prefix = context.nodeType.isEmpty() ? QString() : context.nodeType + QStringLiteral(": ");
  return (QStringLiteral("[Bug]: ") + prefix + redactSecretsInText(subject)).left(maxTitleChars);
}

QString bugReportBody(const BugReportContext &context, const QString &systemInfo) {
  QStringList lines{QStringLiteral("Reported from: %1").arg(context.source)};
  if (!context.nodeType.isEmpty()) {
    lines.append(QStringLiteral("Node: `%1`").arg(context.nodeType) +
                 (context.nodeTitle.isEmpty() ? QString() : QStringLiteral(" (\"%1\")").arg(context.nodeTitle)));
  }
  if (!context.workflowId.isEmpty()) { lines.append(QStringLiteral("Workflow: `%1`").arg(context.workflowId)); }
  if (!context.jobId.isEmpty()) { lines.append(QStringLiteral("Job: `%1`").arg(context.jobId)); }
  const auto error = context.errorText.isEmpty()
                         ? QString()
                         : QStringLiteral("\n### Error\n\n```\n%1\n```\n").arg(redactSecretsInText(context.errorText).left(maxErrorChars));
  const auto body = QStringLiteral(
                        "### Describe the bug\n\n%1\n\n### Steps to reproduce\n\n%1\n\n### Expected behavior\n\n%1\n\n"
                        "### Context\n\n%2\n%3\n### Attached files\n\nNo report bundle was attached.\n\n"
                        "### System information\n\n```\n%4\n```\n\n---\n*Created by the Report control in the NodeTool native editor.*\n")
                        .arg(orNotProvided({}), lines.join(QLatin1Char('\n')), error, systemInfo);
  return body.size() <= maxBodyChars ? body : body.left(maxBodyChars) + QStringLiteral("\n… (truncated)");
}

QUrl bugReportUrl(const BugReportContext &context, const QString &systemInfo) {
  QUrl url(QString::fromLatin1(issueUrl));
  QUrlQuery query;
  query.addQueryItem(QStringLiteral("title"), QString::fromUtf8(QUrl::toPercentEncoding(bugReportTitle(context))));
  query.addQueryItem(QStringLiteral("body"), QString::fromUtf8(QUrl::toPercentEncoding(bugReportBody(context, systemInfo))));
  query.addQueryItem(QStringLiteral("labels"), QStringLiteral("bug"));
  url.setQuery(query.query(QUrl::FullyEncoded), QUrl::StrictMode);
  return url;
}

}  // namespace nodetool::node_editor
