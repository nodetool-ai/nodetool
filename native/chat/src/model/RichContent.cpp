#include "RichContent.h"
#include <QHash>
#include <algorithm>
#include <vector>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QSet>
#include <QUrl>
namespace nt::chat {
namespace {
const QSet<QString> &allowedTags() {
  static const QSet<QString> tags{
      "a", "abbr", "b", "blockquote", "br", "caption", "cite", "code", "dd",
      "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption", "figure",
      "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "ins", "kbd", "li", "mark",
      "ol", "p", "pre", "q", "rp", "rt", "ruby", "s", "samp", "section",
      "small", "span", "strike", "strong", "sub", "summary", "sup", "table",
      "tbody", "td", "tfoot", "th", "thead", "time", "tr", "tt", "u", "ul",
      "var", "wbr"};
  return tags;
}
// Removed with everything inside them.
const QSet<QString> &droppedTags() {
  static const QSet<QString> tags{
      "button", "form", "frameset", "iframe", "math", "noscript", "object",
      "script", "select", "style", "svg", "template", "textarea", "title"};
  return tags;
}
// Removed, and they have no content.
const QSet<QString> &droppedVoidTags() {
  static const QSet<QString> tags{"base", "embed", "frame", "link", "meta"};
  return tags;
}
const QSet<QString> &allowedAttributes() {
  static const QSet<QString> names{
      "alt", "align", "cite", "colspan", "rowspan", "datetime", "dir",
      "height", "href", "lang", "open", "start", "title", "width"};
  return names;
}
bool safeHref(const QString &href) {
  const QUrl url(href.trimmed());
  const auto scheme = url.scheme().toLower();
  if (scheme.isEmpty()) { return !href.trimmed().startsWith("//"); }
  static const QSet<QString> schemes{
      "http", "https", "mailto", "asset", "workflow", "app", "sketch",
      "timeline", "model3d", "game", "storyboard", "thread", "script",
      "jsscript", "collection"};
  return schemes.contains(scheme);
}
QString escapeAttribute(QString value) {
  return value.replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;").replace('>', "&gt;");
}
QHash<QString, QString> attributes(const QString &source) {
  static const QRegularExpression pattern(
      R"re(([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?)re");
  QHash<QString, QString> result;
  auto matches = pattern.globalMatch(source);
  while (matches.hasNext()) {
    const auto match = matches.next();
    auto value = match.captured(2);
    if (value.isEmpty()) { value = match.captured(3); }
    if (value.isEmpty()) { value = match.captured(4); }
    result.insert(match.captured(1).toLower(), value);
  }
  return result;
}
QString escapeMarkdown(const QString &text) {
  QString out;
  out.reserve(text.size());
  for (const auto ch : text) {
    if (QStringLiteral("\\`*_[]<>#|").contains(ch)) { out += '\\'; }
    out += ch;
  }
  return out;
}

// A recursive reader over one LaTeX expression.
class TexReader {
public:
  explicit TexReader(const QString &source) : m_source(source) {}
  QString read() { return readUntil(QChar()); }

private:
  const QString &m_source;
  qsizetype m_at = 0;
  QChar peek() const { return m_at < m_source.size() ? m_source[m_at] : QChar(); }
  bool done() const { return m_at >= m_source.size(); }
  QString readUntil(QChar close) {
    QString out;
    while (!done()) {
      const auto ch = peek();
      if (!close.isNull() && ch == close) { ++m_at; return out; }
      out += atom(true);
    }
    return out;
  }
  // One unit: a group, a command with its arguments, or a character, plus
  // any scripts that follow it when withScripts is set.
  QString atom(bool withScripts) {
    QString base;
    const auto ch = peek();
    if (ch == '{') { ++m_at; base = readUntil('}'); }
    else if (ch == '\\') { base = command(); }
    else if (ch == '^' || ch == '_') { base = QString(); }
    else if (ch == '&') { ++m_at; base = QStringLiteral("  "); }
    else if (ch == '~') { ++m_at; base = QStringLiteral(" "); }
    else { ++m_at; base = ch; }
    while (withScripts && (peek() == '^' || peek() == '_')) {
      const bool super = peek() == '^';
      ++m_at;
      skipSpaces();
      base += script(atom(false), super);
    }
    return base;
  }
  void skipSpaces() { while (peek() == ' ') { ++m_at; } }
  QString argument() { skipSpaces(); return done() ? QString() : atom(false); }
  QString command() {
    ++m_at;  // the backslash
    if (done()) { return QStringLiteral("\\"); }
    QString name;
    if (!m_source[m_at].isLetter()) {
      name = m_source[m_at++];
    } else {
      while (!done() && m_source[m_at].isLetter()) { name += m_source[m_at++]; }
    }
    static const QHash<QString, QString> symbols{
        {"alpha", "α"}, {"beta", "β"}, {"gamma", "γ"}, {"delta", "δ"},
        {"epsilon", "ε"}, {"varepsilon", "ε"}, {"zeta", "ζ"}, {"eta", "η"},
        {"theta", "θ"}, {"vartheta", "ϑ"}, {"iota", "ι"}, {"kappa", "κ"},
        {"lambda", "λ"}, {"mu", "μ"}, {"nu", "ν"}, {"xi", "ξ"}, {"pi", "π"},
        {"varpi", "ϖ"}, {"rho", "ρ"}, {"varrho", "ϱ"}, {"sigma", "σ"},
        {"varsigma", "ς"}, {"tau", "τ"}, {"upsilon", "υ"}, {"phi", "ϕ"},
        {"varphi", "φ"}, {"chi", "χ"}, {"psi", "ψ"}, {"omega", "ω"},
        {"Gamma", "Γ"}, {"Delta", "Δ"}, {"Theta", "Θ"}, {"Lambda", "Λ"},
        {"Xi", "Ξ"}, {"Pi", "Π"}, {"Sigma", "Σ"}, {"Upsilon", "Υ"},
        {"Phi", "Φ"}, {"Psi", "Ψ"}, {"Omega", "Ω"},
        {"times", "×"}, {"cdot", "⋅"}, {"div", "÷"}, {"pm", "±"}, {"mp", "∓"},
        {"leq", "≤"}, {"le", "≤"}, {"geq", "≥"}, {"ge", "≥"}, {"neq", "≠"},
        {"ne", "≠"}, {"approx", "≈"}, {"equiv", "≡"}, {"sim", "∼"},
        {"simeq", "≃"}, {"propto", "∝"}, {"ll", "≪"}, {"gg", "≫"},
        {"infty", "∞"}, {"partial", "∂"}, {"nabla", "∇"}, {"sum", "∑"},
        {"prod", "∏"}, {"int", "∫"}, {"iint", "∬"}, {"oint", "∮"},
        {"in", "∈"}, {"notin", "∉"}, {"ni", "∋"}, {"subset", "⊂"},
        {"subseteq", "⊆"}, {"supset", "⊃"}, {"supseteq", "⊇"}, {"cup", "∪"},
        {"cap", "∩"}, {"emptyset", "∅"}, {"varnothing", "∅"}, {"forall", "∀"},
        {"exists", "∃"}, {"neg", "¬"}, {"lnot", "¬"}, {"land", "∧"},
        {"wedge", "∧"}, {"lor", "∨"}, {"vee", "∨"}, {"oplus", "⊕"},
        {"otimes", "⊗"}, {"circ", "∘"}, {"bullet", "∙"}, {"star", "⋆"},
        {"to", "→"}, {"rightarrow", "→"}, {"leftarrow", "←"},
        {"gets", "←"}, {"leftrightarrow", "↔"}, {"Rightarrow", "⇒"},
        {"implies", "⇒"}, {"Leftarrow", "⇐"}, {"Leftrightarrow", "⇔"},
        {"iff", "⇔"}, {"mapsto", "↦"}, {"uparrow", "↑"}, {"downarrow", "↓"},
        {"ldots", "…"}, {"dots", "…"}, {"cdots", "⋯"}, {"vdots", "⋮"},
        {"ddots", "⋱"}, {"prime", "′"}, {"angle", "∠"}, {"perp", "⊥"},
        {"parallel", "∥"}, {"mid", "∣"}, {"hbar", "ℏ"}, {"ell", "ℓ"},
        {"Re", "ℜ"}, {"Im", "ℑ"}, {"aleph", "ℵ"}, {"degree", "°"},
        {"langle", "⟨"}, {"rangle", "⟩"}, {"lfloor", "⌊"}, {"rfloor", "⌋"},
        {"lceil", "⌈"}, {"rceil", "⌉"}, {"vert", "|"}, {"Vert", "‖"},
        {"lvert", "|"}, {"rvert", "|"}, {"lVert", "‖"}, {"rVert", "‖"},
        {"{", "{"}, {"}", "}"}, {"%", "%"}, {"$", "$"}, {"#", "#"}, {"&", "&"},
        {"_", "_"}, {",", " "}, {";", " "}, {":", " "}, {"!", ""}, {" ", " "},
        {"quad", "  "}, {"qquad", "    "}, {"\\", "\n"}, {"|", "‖"},
        {"sin", "sin"}, {"cos", "cos"}, {"tan", "tan"}, {"log", "log"},
        {"ln", "ln"}, {"exp", "exp"}, {"lim", "lim"}, {"max", "max"},
        {"min", "min"}, {"det", "det"}, {"sup", "sup"}, {"inf", "inf"},
        {"arg", "arg"}, {"deg", "deg"}, {"gcd", "gcd"}, {"mod", "mod"},
        {"bmod", "mod"}};
    static const QSet<QString> ignored{
        "left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl",
        "Bigr", "displaystyle", "textstyle", "limits", "nolimits", "middle"};
    static const QSet<QString> passThrough{
        "text", "textrm", "textbf", "textit", "mathrm", "mathbf", "mathit",
        "mathsf", "mathtt", "boldsymbol", "operatorname", "mbox", "emph"};
    static const QHash<QString, QChar> accents{
        {"hat", QChar(0x0302)}, {"widehat", QChar(0x0302)}, {"bar", QChar(0x0304)},
        {"overline", QChar(0x0305)}, {"vec", QChar(0x20D7)}, {"dot", QChar(0x0307)},
        {"ddot", QChar(0x0308)}, {"tilde", QChar(0x0303)}, {"widetilde", QChar(0x0303)}};
    if (symbols.contains(name)) { return symbols.value(name); }
    if (ignored.contains(name)) { return {}; }
    if (passThrough.contains(name)) { return argument(); }
    if (accents.contains(name)) {
      const auto body = argument();
      QString out;
      for (const auto ch : body) { out += ch; if (!ch.isSpace()) { out += accents.value(name); } }
      return out;
    }
    if (name == "frac" || name == "dfrac" || name == "tfrac") {
      const auto top = argument();
      const auto bottom = argument();
      return wrap(top) + "/" + wrap(bottom);
    }
    if (name == "sqrt") {
      QString index;
      if (peek() == '[') {
        ++m_at;
        while (!done() && peek() != ']') { index += m_source[m_at++]; }
        ++m_at;
      }
      const auto body = argument();
      return (index.isEmpty() ? QString() : script(index, true)) + "√" + wrap(body);
    }
    if (name == "mathbb") {
      static const QHash<QString, QString> blackboard{
          {"R", "ℝ"}, {"N", "ℕ"}, {"Z", "ℤ"}, {"Q", "ℚ"}, {"C", "ℂ"}, {"P", "ℙ"}};
      const auto body = argument();
      return blackboard.value(body, body);
    }
    if (name == "begin" || name == "end") { argument(); return name == "end" ? QStringLiteral("\n") : QString(); }
    if (name == "binom") {
      const auto top = argument();
      const auto bottom = argument();
      return "C(" + top + ", " + bottom + ")";
    }
    return "\\" + name;
  }
  static QString wrap(const QString &text) {
    const auto trimmed = text.trimmed();
    if (trimmed.size() <= 1) { return trimmed; }
    static const QRegularExpression simple(R"(^[\p{L}\p{N}.]+$)");
    return simple.match(trimmed).hasMatch() ? trimmed : "(" + trimmed + ")";
  }
  static QString script(const QString &text, bool super) {
    static const QHash<QChar, QChar> superscripts = [] {
      QHash<QChar, QChar> map;
      const QString from = "0123456789+-=()nijabcdefghklmoprstuvwxyzT";
      const QString to = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱʲᵃᵇᶜᵈᵉᶠᵍʰᵏˡᵐᵒᵖʳˢᵗᵘᵛʷˣʸᶻᵀ";
      for (qsizetype i = 0; i < from.size(); ++i) { map.insert(from[i], to[i]); }
      map.insert(QChar(0x2032), QChar(0x2032));
      return map;
    }();
    static const QHash<QChar, QChar> subscripts = [] {
      QHash<QChar, QChar> map;
      const QString from = "0123456789+-=()aehijklmnoprstuvx";
      const QString to = "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ";
      for (qsizetype i = 0; i < from.size(); ++i) { map.insert(from[i], to[i]); }
      return map;
    }();
    const auto &map = super ? superscripts : subscripts;
    QString out;
    for (const auto ch : text) {
      if (!map.contains(ch)) {
        const auto marker = super ? QStringLiteral("^") : QStringLiteral("_");
        return text.size() == 1 ? marker + text : marker + "(" + text + ")";
      }
      out += map.value(ch);
    }
    return out;
  }
};
}  // namespace

QString sanitizeChatHtml(const QString &html) {
  static const QRegularExpression tag(
      R"(<!--[\s\S]*?(?:-->|$)|<![A-Za-z][^>]*>|<\?[^>]*>|<(/?)([A-Za-z][A-Za-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>)");
  QString out;
  qsizetype cursor = 0;
  auto matches = tag.globalMatch(html);
  while (matches.hasNext()) {
    const auto match = matches.next();
    if (match.capturedStart() < cursor) { continue; }
    out += html.mid(cursor, match.capturedStart() - cursor);
    cursor = match.capturedEnd();
    const auto name = match.captured(2).toLower();
    if (name.isEmpty()) { continue; }  // a comment, doctype or instruction
    const auto rest = match.captured(3);
    if (!rest.isEmpty() && !rest[0].isSpace() && rest[0] != '/') {
      out += match.captured();  // an autolink such as <https://…>, not a tag
      continue;
    }
    const bool closing = !match.captured(1).isEmpty();
    if (droppedVoidTags().contains(name)) { continue; }
    if (droppedTags().contains(name)) {
      if (closing) { continue; }
      const QRegularExpression end("</" + QRegularExpression::escape(name) + R"(\s*>)",
                                   QRegularExpression::CaseInsensitiveOption);
      const auto close = end.match(html, cursor);
      cursor = close.hasMatch() ? close.capturedEnd() : html.size();
      while (matches.hasNext() && matches.peekNext().capturedStart() < cursor) { matches.next(); }
      continue;
    }
    const auto attrs = attributes(match.captured(3));
    if (name == "img") {
      const auto src = attrs.value("src").trimmed();
      const auto alt = attrs.value("alt");
      if (!src.isEmpty() && !src.contains(')') && !src.contains(' ')) {
        out += "![" + escapeMarkdown(alt) + "](" + src + ")";
      } else {
        out += alt.toHtmlEscaped();
      }
      continue;
    }
    if (name == "input") {
      if (!closing && attrs.value("type").toLower() == "checkbox") {
        out += attrs.contains("checked") ? QStringLiteral("☑ ") : QStringLiteral("☐ ");
      }
      continue;
    }
    if (!allowedTags().contains(name)) { continue; }
    if (closing) { out += "</" + name + ">"; continue; }
    QString rebuilt = "<" + name;
    for (auto it = attrs.cbegin(); it != attrs.cend(); ++it) {
      if (!allowedAttributes().contains(it.key())) { continue; }
      if (it.key() == "href" && !safeHref(it.value())) { continue; }
      rebuilt += " " + it.key() + "=\"" + escapeAttribute(it.value()) + "\"";
    }
    out += rebuilt + (match.captured(3).trimmed().endsWith('/') ? "/>" : ">");
  }
  out += html.mid(cursor);
  return out;
}

QString texToUnicode(const QString &tex) {
  QString collapsed = tex;
  collapsed.replace('\n', ' ');
  return TexReader(collapsed).read().trimmed();
}

QString renderInlineMath(const QString &markdown) {
  if (!markdown.contains("$$") && !markdown.contains("\\(")) { return markdown; }
  static const QRegularExpression code(R"(`[^`\n]*`)");
  static const QRegularExpression math(R"(\\\(([\s\S]+?)\\\)|\$\$([^\n$]+?)\$\$)");
  QString out;
  qsizetype cursor = 0;
  auto convert = [](const QString &prose) {
    QString result;
    qsizetype at = 0;
    auto found = math.globalMatch(prose);
    while (found.hasNext()) {
      const auto match = found.next();
      result += prose.mid(at, match.capturedStart() - at);
      const auto body = match.captured(1).isEmpty() ? match.captured(2) : match.captured(1);
      result += escapeMarkdown(texToUnicode(body));
      at = match.capturedEnd();
    }
    return result + prose.mid(at);
  };
  auto spans = code.globalMatch(markdown);
  while (spans.hasNext()) {
    const auto span = spans.next();
    out += convert(markdown.mid(cursor, span.capturedStart() - cursor)) + span.captured();
    cursor = span.capturedEnd();
  }
  return out + convert(markdown.mid(cursor));
}

namespace {
QString pick(const QJsonObject &object, std::initializer_list<const char *> keys) {
  for (const auto key : keys) {
    const auto value = object.value(QLatin1String(key));
    if (value.isString() && !value.toString().trimmed().isEmpty()) { return value.toString().trimmed(); }
  }
  return {};
}
QString domain(const QString &url) {
  const QUrl parsed(url);
  if (!parsed.isValid() || parsed.host().isEmpty()) { return {}; }
  auto host = parsed.host();
  if (host.startsWith("www.")) { host = host.mid(4); }
  return host;
}
QJsonArray itemsFrom(const QJsonArray &entries) {
  QJsonArray items;
  for (const auto &entry : entries) {
    if (!entry.isObject()) { continue; }
    const auto object = entry.toObject();
    const auto url = pick(object, {"url", "link", "original"});
    const auto title = pick(object, {"title", "name", "heading"});
    if (title.isEmpty() && url.isEmpty()) { continue; }
    QString source = pick(object, {"source"});
    if (source.isEmpty() && object["source"].isObject()) { source = pick(object["source"].toObject(), {"name"}); }
    if (source.isEmpty()) { source = domain(url); }
    QJsonObject item{{"title", title.isEmpty() ? (url.isEmpty() ? QStringLiteral("(untitled)") : url) : title}};
    const auto snippet = pick(object, {"snippet", "description", "summary", "content"});
    const auto date = pick(object, {"date", "published", "published_at"});
    if (!url.isEmpty()) { item["url"] = url; }
    if (!snippet.isEmpty()) { item["snippet"] = snippet; }
    if (!source.isEmpty()) { item["source"] = source; }
    if (!date.isEmpty()) { item["date"] = date; }
    items.append(item);
  }
  return items;
}
QJsonArray numberedText(const QString &text) {
  static const QRegularExpression numbered(R"(^\d+\.\s+(.*)$)");
  static const QRegularExpression web(R"(^https?://)", QRegularExpression::CaseInsensitiveOption);
  QJsonArray items;
  QJsonObject current;
  QStringList snippet;
  auto flush = [&] {
    if (current.isEmpty()) { return; }
    const auto joined = snippet.join(' ').trimmed();
    if (!joined.isEmpty()) { current["snippet"] = joined; }
    if (current.contains("url")) {
      const auto host = domain(current["url"].toString());
      if (!host.isEmpty()) { current["source"] = host; }
    }
    items.append(current);
    current = {};
    snippet.clear();
  };
  for (const auto &raw : text.split('\n')) {
    const auto line = raw.trimmed();
    const auto match = numbered.match(line);
    if (match.hasMatch()) {
      flush();
      const auto title = match.captured(1).trimmed();
      current["title"] = title.isEmpty() ? QStringLiteral("(untitled)") : title;
      continue;
    }
    if (current.isEmpty() || line.isEmpty()) { continue; }
    if (web.match(line).hasMatch() && !current.contains("url")) { current["url"] = line; }
    else { snippet << line; }
  }
  flush();
  return items;
}
}  // namespace

QJsonArray normalizeSearchResults(const QJsonValue &content) {
  if (content.isString()) {
    const auto text = content.toString().trimmed();
    if (text.isEmpty()) { return {}; }
    if (text.startsWith('{') || text.startsWith('[')) {
      QJsonParseError error{};
      const auto document = QJsonDocument::fromJson(text.toUtf8(), &error);
      if (error.error == QJsonParseError::NoError) {
        return normalizeSearchResults(document.isArray() ? QJsonValue(document.array()) : QJsonValue(document.object()));
      }
    }
    const auto items = numberedText(text);
    for (const auto &item : items) {
      if (item.toObject().contains("url")) { return items; }
    }
    return {};
  }
  if (content.isArray()) { return itemsFrom(content.toArray()); }
  if (content.isObject()) {
    const auto object = content.toObject();
    for (const auto key : {"results", "organic_results", "items"}) {
      if (object.value(QLatin1String(key)).isArray()) { return itemsFrom(object.value(QLatin1String(key)).toArray()); }
    }
  }
  return {};
}
QJsonObject generationBatch(const QJsonValue &live, const QJsonValue &result) {
  if (live.isObject() && live.toObject()["items"].isArray()) { return live.toObject(); }
  auto value = result;
  if (value.isString()) { value = QJsonDocument::fromJson(value.toString().toUtf8()).object(); }
  const auto batch = value.toObject()["batch"].toObject();
  return batch["items"].isArray() ? batch : QJsonObject{};
}

namespace {
QString seconds(double value) {
  const auto whole = qRound64(std::max(0.0, value));
  if (whole < 60) { return QString::number(whole) + "s"; }
  return QString("%1m %2s").arg(whole / 60).arg(whole % 60);
}
}  // namespace

QJsonObject generationBatchProgress(const QJsonObject &batch, double nowMs) {
  constexpr double runningCap = 0.95;
  const auto items = batch["items"].toArray();
  const int concurrency = std::max(1, batch["concurrency"].toInt(1));
  int done = 0, failed = 0;
  double expected = 0, achieved = 0;
  std::vector<double> lanes;
  QJsonArray rows;
  for (const auto &value : items) {
    const auto item = value.toObject();
    const auto status = item["status"].toString();
    const double estimate = std::max(1.0, item["estimate_seconds"].toDouble());
    const bool started = item["started_at"].isDouble();
    const double elapsed = started ? std::max(0.0, (nowMs - item["started_at"].toDouble()) / 1000) : 0;
    expected += estimate;
    if (status == "completed") { ++done; }
    if (status == "failed") { ++failed; }
    if (status == "completed" || status == "failed") { achieved += estimate; }
    else if (status == "running") {
      achieved += std::min(elapsed, estimate * runningCap);
      lanes.push_back(std::max(1.0, estimate - elapsed));
    }
    QString timing;
    if (started && item["finished_at"].isDouble()) {
      timing = "Took " + seconds((item["finished_at"].toDouble() - item["started_at"].toDouble()) / 1000);
    } else if (status == "running" && started) {
      timing = seconds(elapsed) + " / " + seconds(item["estimate_seconds"].toDouble());
    } else {
      timing = "Expected " + seconds(item["estimate_seconds"].toDouble());
    }
    QStringList model;
    for (const auto key : {"provider", "model"}) {
      if (!item[key].toString().isEmpty()) { model << item[key].toString(); }
    }
    rows.append(QJsonObject{{"label", item["label"].toString()}, {"status", status}, {"timing", timing},
                            {"model", model.join(':')}, {"prompt", item["prompt"].toString()},
                            {"error", item["error"].toString()}});
  }
  while (int(lanes.size()) < concurrency) { lanes.push_back(0); }
  for (const auto &value : items) {
    const auto item = value.toObject();
    if (item["status"] != "queued") { continue; }
    std::sort(lanes.begin(), lanes.end());
    lanes.front() += std::max(1.0, item["estimate_seconds"].toDouble());
  }
  const int total = int(items.size());
  const bool settled = done + failed == total;
  QJsonObject progress{{"done", done}, {"failed", failed}, {"total", total}, {"items", rows}};
  progress["percent"] = total == 0 ? 0.0 : settled ? 100.0 : std::min(99.0, achieved / expected * 100);
  progress["remainingSeconds"] = settled ? QJsonValue() : QJsonValue(qRound64(*std::max_element(lanes.begin(), lanes.end())));
  return progress;
}
}  // namespace nt::chat
