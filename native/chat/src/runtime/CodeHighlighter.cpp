#include "CodeHighlighter.h"
#include <QHash>
#include <QRegularExpression>
#include <QSet>
#include <QTextCharFormat>
namespace nt::chat {
namespace {
struct Palette {
  QColor comment, keyword, tag, string, number, function;
};
// codeBlockColors.ts: oneDarkColors and oneLightColors.
Palette palette(bool dark) {
  return dark ? Palette{"#5c6370", "#c678dd", "#e06c75", "#98c379", "#d19a66", "#61afef"}
              : Palette{"#a0a1a7", "#a626a4", "#e45649", "#50a14f", "#986801", "#4078f2"};
}
const QHash<QString, QSet<QString>> &keywords() {
  static const QHash<QString, QSet<QString>> sets{
      {"js", {"async", "await", "break", "case", "catch", "class", "const", "continue", "default", "delete",
              "do", "else", "export", "extends", "false", "finally", "for", "from", "function", "if",
              "import", "in", "instanceof", "interface", "let", "new", "null", "of", "return", "static",
              "super", "switch", "this", "throw", "true", "try", "type", "typeof", "undefined", "var",
              "void", "while", "yield", "enum", "implements", "private", "protected", "public", "readonly"}},
      {"python", {"and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
                  "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import",
                  "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return",
                  "True", "try", "while", "with", "yield", "self"}},
      {"c", {"auto", "bool", "break", "case", "catch", "char", "class", "const", "constexpr", "continue",
             "default", "delete", "do", "double", "else", "enum", "explicit", "extern", "false", "float",
             "for", "if", "inline", "int", "long", "namespace", "new", "nullptr", "override", "private",
             "protected", "public", "return", "short", "signed", "sizeof", "static", "struct", "switch",
             "template", "this", "throw", "true", "try", "typedef", "typename", "union", "unsigned",
             "using", "virtual", "void", "volatile", "while", "final", "import", "package", "extends",
             "implements", "interface", "string", "var", "foreach", "null", "boolean"}},
      {"rust", {"as", "async", "await", "break", "const", "continue", "crate", "else", "enum", "extern",
                "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut",
                "pub", "ref", "return", "self", "Self", "static", "struct", "super", "trait", "true",
                "type", "unsafe", "use", "where", "while"}},
      {"go", {"break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough",
              "false", "for", "func", "go", "goto", "if", "import", "interface", "map", "nil", "package",
              "range", "return", "select", "struct", "switch", "true", "type", "var"}},
      {"shell", {"if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac", "in",
                 "function", "return", "export", "local", "echo", "cd", "sudo", "set", "unset"}},
      {"sql", {"select", "from", "where", "insert", "into", "values", "update", "set", "delete", "create",
               "table", "drop", "alter", "join", "left", "right", "inner", "outer", "on", "group", "by",
               "order", "having", "limit", "and", "or", "not", "null", "as", "distinct", "union",
               "primary", "key", "index", "with", "case", "when", "then", "else", "end", "is", "in"}},
      {"json", {"true", "false", "null"}},
      {"css", {"important"}},
      {"markup", {}}};
  return sets;
}
}  // namespace

QString CodeHighlighter::family(const QString &language) {
  static const QHash<QString, QString> families{
      {"js", "js"}, {"javascript", "js"}, {"jsx", "js"}, {"ts", "js"}, {"typescript", "js"},
      {"tsx", "js"}, {"mjs", "js"}, {"cjs", "js"}, {"py", "python"}, {"python", "python"},
      {"c", "c"}, {"h", "c"}, {"cpp", "c"}, {"c++", "c"}, {"cc", "c"}, {"hpp", "c"},
      {"cs", "c"}, {"csharp", "c"}, {"java", "c"}, {"kotlin", "c"}, {"swift", "c"},
      {"qml", "js"}, {"rust", "rust"}, {"rs", "rust"}, {"go", "go"}, {"golang", "go"},
      {"sh", "shell"}, {"bash", "shell"}, {"shell", "shell"}, {"zsh", "shell"}, {"console", "shell"},
      {"sql", "sql"}, {"json", "json"}, {"jsonc", "json"}, {"css", "css"}, {"scss", "css"},
      {"html", "markup"}, {"xml", "markup"}, {"svg", "markup"}, {"markup", "markup"},
      {"yaml", "shell"}, {"yml", "shell"}, {"toml", "shell"}, {"dockerfile", "shell"}};
  return families.value(language.trimmed().toLower());
}
void CodeHighlighter::setSource(QQuickTextDocument *source) {
  if (m_source == source) { return; }
  m_source = source;
  setDocument(source ? source->textDocument() : nullptr);
  emit changed();
}
void CodeHighlighter::setLanguage(const QString &language) {
  if (m_language == language) { return; }
  m_language = language;
  m_family = family(language);
  rehighlight();
  emit changed();
}
void CodeHighlighter::setDark(bool dark) {
  if (m_dark == dark) { return; }
  m_dark = dark;
  rehighlight();
  emit changed();
}
void CodeHighlighter::highlightBlock(const QString &text) {
  if (m_family.isEmpty()) { return; }
  const auto colours = palette(m_dark);
  auto paint = [this](qsizetype start, qsizetype length, const QColor &colour) {
    QTextCharFormat format;
    format.setForeground(colour);
    setFormat(int(start), int(length), format);
  };
  if (m_family == "markup") {
    static const QRegularExpression markup(
        R"((<!--.*?(?:-->|$))|(</?[A-Za-z][\w:-]*)|([\w:-]+)(?==)|("[^"]*"|'[^']*'))");
    auto matches = markup.globalMatch(text);
    while (matches.hasNext()) {
      const auto match = matches.next();
      const QColor colour = match.capturedStart(1) >= 0 ? colours.comment
                            : match.capturedStart(2) >= 0 ? colours.tag
                            : match.capturedStart(3) >= 0 ? colours.number : colours.string;
      paint(match.capturedStart(), match.capturedLength(), colour);
    }
    return;
  }
  const bool hashComments = m_family == "python" || m_family == "shell";
  const bool dashComments = m_family == "sql";
  const bool blockComments = !hashComments && !dashComments;
  static const QRegularExpression token(
      R"((//[^\n]*|/\*|#[^\n]*|--[^\n]*)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?)|(\b\d[\w.]*\b)|([A-Za-z_$][\w$]*)(\s*\()?)");
  const auto &words = keywords().value(m_family);
  qsizetype at = 0;
  if (blockComments && previousBlockState() == 1) {
    const auto end = text.indexOf("*/");
    if (end < 0) { paint(0, text.size(), colours.comment); setCurrentBlockState(1); return; }
    paint(0, end + 2, colours.comment);
    at = end + 2;
  }
  setCurrentBlockState(0);
  auto matches = token.globalMatch(text, at);
  while (matches.hasNext()) {
    const auto match = matches.next();
    if (match.capturedStart(1) >= 0) {
      const auto comment = match.captured(1);
      const bool slash = comment.startsWith("//") || comment == "/*";
      if ((slash && !blockComments) || (comment.startsWith('#') && !hashComments) ||
          (comment.startsWith("--") && !dashComments)) {
        continue;
      }
      if (comment == "/*") {
        const auto end = text.indexOf("*/", match.capturedEnd());
        if (end < 0) { paint(match.capturedStart(), text.size() - match.capturedStart(), colours.comment); setCurrentBlockState(1); return; }
        paint(match.capturedStart(), end + 2 - match.capturedStart(), colours.comment);
        matches = token.globalMatch(text, end + 2);
        continue;
      }
      paint(match.capturedStart(), text.size() - match.capturedStart(), colours.comment);
      return;
    }
    if (match.capturedStart(2) >= 0) {
      const bool key = m_family == "json" && text.mid(match.capturedEnd()).trimmed().startsWith(':');
      paint(match.capturedStart(2), match.capturedLength(2), key ? colours.tag : colours.string);
    } else if (match.capturedStart(3) >= 0) {
      paint(match.capturedStart(3), match.capturedLength(3), colours.number);
    } else {
      const auto word = match.captured(4);
      const bool keyword = m_family == "sql" ? words.contains(word.toLower()) : words.contains(word);
      if (keyword) { paint(match.capturedStart(4), word.size(), colours.keyword); }
      else if (match.capturedStart(5) >= 0) { paint(match.capturedStart(4), word.size(), colours.function); }
    }
  }
}
}  // namespace nt::chat
