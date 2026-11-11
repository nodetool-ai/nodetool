#include "PlanDocument.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QHash>
#include <QStringList>
namespace nt::chat {
QJsonObject parsePlanDocument(const QJsonValue &value) {
  const auto record = value.isString()
      ? QJsonDocument::fromJson(value.toString().toUtf8()).object() : value.toObject();
  const auto title = record["title"].toString().trimmed();
  if (title.isEmpty()) { return {}; }
  QJsonArray tasks;
  int taskIndex = 0;
  int independent = 0;
  for (const auto &raw : record["tasks"].toArray()) {
    ++taskIndex;
    const auto task = raw.toObject();
    const auto taskTitle = task["title"].toString().trimmed();
    if (taskTitle.isEmpty()) { continue; }
    auto id = task["id"].toString().trimmed();
    if (id.isEmpty()) { id = QString("task-%1").arg(taskIndex); }
    const auto deps = task["depends_on"].isNull() || task["depends_on"].isUndefined()
        ? task["dependsOn"] : task["depends_on"];
    QJsonArray dependencies, steps;
    for (const auto &dep : deps.toArray()) {
      const auto text = dep.toString().trimmed();
      if (!text.isEmpty()) { dependencies.append(text); }
    }
    if (dependencies.isEmpty()) { ++independent; }
    int stepIndex = 0;
    for (const auto &rawStep : task["steps"].toArray()) {
      ++stepIndex;
      const auto step = rawStep.toObject();
      const auto instructions = step["instructions"].toString().trimmed();
      if (instructions.isEmpty()) { continue; }
      auto stepId = step["id"].toString().trimmed();
      if (stepId.isEmpty()) { stepId = QString("step-%1").arg(stepIndex); }
      steps.append(QJsonObject{{"id", stepId}, {"instructions", instructions}});
    }
    tasks.append(QJsonObject{{"id", id}, {"title", taskTitle}, {"dependsOn", dependencies}, {"steps", steps}});
  }
  if (tasks.isEmpty()) { return {}; }
  return {{"title", title}, {"tasks", tasks},
          {"executed", record["executed"].isBool() ? record["executed"] : QJsonValue(QJsonValue::Null)},
          {"parallelizable", record["parallelizable"].isDouble() ? record["parallelizable"] : QJsonValue(independent)}};
}
QString planDocumentText(const QJsonObject &plan) {
  const auto tasks = plan["tasks"].toArray();
  QHash<QString, QString> titles;
  int steps = 0;
  for (const auto &value : tasks) {
    const auto task = value.toObject();
    titles[task["id"].toString()] = task["title"].toString();
    steps += task["steps"].toArray().size();
  }
  QStringList lines{plan["title"].toString(), QString("%1 tasks · %2 steps").arg(tasks.size()).arg(steps)};
  if (plan["parallelizable"].toDouble() > 1) {
    lines.append(QString("%1 tasks can run together").arg(plan["parallelizable"].toDouble()));
  }
  int index = 0;
  for (const auto &value : tasks) {
    const auto task = value.toObject();
    lines.append(QString("\n%1. %2").arg(++index).arg(task["title"].toString()));
    QStringList deps;
    for (const auto &dep : task["dependsOn"].toArray()) { deps.append(titles.value(dep.toString(), dep.toString())); }
    if (!deps.isEmpty()) { lines.append("after " + deps.join(", ")); }
    for (const auto &step : task["steps"].toArray()) { lines.append(step.toObject()["instructions"].toString()); }
  }
  if (plan["executed"] == false) { lines.append("\nNothing ran. Switch to Default or Auto, then send a message."); }
  return lines.join('\n');
}
}
