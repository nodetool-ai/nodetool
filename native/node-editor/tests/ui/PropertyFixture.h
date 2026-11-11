#pragma once
#include <QJsonArray>
#include <QJsonObject>

namespace property_fixture {
// Wire shapes from protocol/api-types.ts and protocol/graph.ts.
inline QJsonObject type(const QString &name, bool optional = false) {
  return {{"type", name}, {"optional", optional}, {"type_args", QJsonArray{}}};
}
inline QJsonObject property(const QString &name, const QString &kind,
                            const QJsonValue &value) {
  return {{"name", name}, {"title", name}, {"description", name + " help"},
          {"type", type(kind)}, {"required", true}, {"default", value}};
}
inline QJsonArray catalog() {
  auto text = property("Text", "str", "baseline");
  text["json_schema_extra"] = QJsonObject{{"multiline", false}};
  auto count = property("Count", "int", 2);
  count["title"] = "Iterations";
  count["min"] = 1;
  count["max"] = 4;
  auto ratio = property("Ratio", "float", 0.5);
  ratio["min"] = 0;
  ratio["max"] = 1;
  auto choice = property("Choice", "enum", 1);
  auto choiceType = type("enum");
  choiceType["values"] = QJsonArray{1, 2, "two"};
  choice["type"] = choiceType;
  auto nullable = property("Nullable", "str", QJsonValue::Null);
  nullable["type"] = type("str", true);
  nullable["required"] = false;
  auto nullableMissing = nullable;
  nullableMissing["name"] = "NullableMissing";
  nullableMissing["title"] = "NullableMissing";
  nullableMissing.remove("default");
  auto omitted = property("Default", "str", "fallback");
  auto multiline = property("Multiline", "str", "first\nsecond");
  multiline["json_schema_extra"] = QJsonObject{{"multiline", true}};
  return {QJsonObject{
      {"node_type", "fixture.Properties"}, {"title", "Property fixture"},
      {"description", "Protocol property controls"}, {"namespace", "fixture"},
      {"layout", "default"}, {"supports_dynamic_inputs", true},
      // Every property is a card row, as web NodeContent shows inline_fields.
      {"inline_fields", QJsonArray{"Text", "Enabled", "Count", "Ratio", "Choice", "Nullable", "NullableMissing",
                                   "Default", "Multiline", "Image", "Model"}},
      {"properties", QJsonArray{text,
                                property("Enabled", "bool", false), count, ratio,
                                choice, nullable, nullableMissing, omitted, multiline,
                                property("Image", "image",
                                         QJsonObject{{"type", "image"},
                                                     {"uri", "asset://fixture-image"}}),
                                property("Model", "model",
                                         QJsonObject{{"id", "external/model"},
                                                     {"provider", "test"}})}},
      {"outputs", QJsonArray{QJsonObject{{"name", "out"},
                                         {"type", type("str")},
                                         {"stream", false}}}}}};
}
inline QJsonObject node(const QString &id) {
  return {{"id", id}, {"type", "fixture.Properties"},
          {"data", QJsonObject{{"Text", "baseline"}, {"Enabled", false},
                                {"Count", 2}, {"Ratio", 0.5}, {"Choice", 1},
                                {"Nullable", QJsonValue::Null},
                                {"Multiline", "first\nsecond"},
                                {"Image", QJsonObject{{"type", "image"},
                                                       {"uri", "asset://fixture-image"}}},
                                {"Model", QJsonObject{{"id", "external/model"},
                                                       {"provider", "test"}}}}},
          {"dynamic_inputs", QJsonObject{{"Dynamic", QJsonObject{
              {"type", type("str")}, {"description", "Dynamic help"},
              {"required", false}}}}},
          {"dynamic_properties", QJsonObject{{"Dynamic", "dynamic baseline"}}}};
}
inline QJsonObject workflow() {
  return {{"graph", QJsonObject{{"nodes", QJsonArray{node("a"), node("b")}},
                                {"edges", QJsonArray{}}}}};
}
}
