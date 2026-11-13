#pragma once
#include <QString>
#include <QUrl>

namespace nodetool::node_editor {

// The prefilled GitHub issue the web Report controls open when no bundle
// upload is configured (web/src/utils/bugReportBundle.ts). Pure functions,
// callable from any thread.
struct BugReportContext {
  // "Node error", "Job failure" or "Error notification", as sourceLabel().
  QString source;
  QString summary;
  QString errorText;
  QString nodeType;
  QString nodeTitle;
  QString workflowId;
  QString jobId;
};

// Replaces credential-shaped substrings with «redacted» and long inline data
// URIs with <inline mime>, as redactSecretsInText.
QString redactSecretsInText(const QString &text);
QString bugReportTitle(const BugReportContext &context);
QString bugReportBody(const BugReportContext &context, const QString &systemInfo);
QUrl bugReportUrl(const BugReportContext &context, const QString &systemInfo);

}  // namespace nodetool::node_editor
