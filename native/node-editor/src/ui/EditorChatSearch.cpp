#include "EditorChatSearch.h"
#include "document/ConnectionTypes.h"
#include <QCollator>
#include <QHash>
#include <QJsonObject>
#include <QRegularExpression>
#include <QSet>
#include <algorithm>
#include <bit>
#include <cmath>
#include <memory>
#include <unordered_map>
#include <vector>

// Each section names the web function it ports. Iteration order follows the
// JavaScript Map insertion order, because truncated result lists and equal
// scores depend on it.
namespace nodetool {
namespace {
struct Meta {
    QJsonObject json;
    QString nodeType;
    QString title;
    QString nameSpace;
    QString description;
    QString cleanDescription;
    QString tags;
    QString useCases;
};

// String.prototype.localeCompare with the default locale of Node and browsers.
int localeCompare(const QString &a, const QString &b) {
    thread_local const QCollator collator(QLocale(QLocale::English, QLocale::UnitedStates));
    return collator.compare(a, b);
}

template <typename Value> class OrderedMap {
  public:
    Value *find(const QString &key) {
        const auto found = index_.constFind(key);
        if (found == index_.cend()) {
            return nullptr;
        }
        return &entries_[static_cast<std::size_t>(*found)].second;
    }
    // Map.prototype.set keeps the position of an existing key.
    void set(const QString &key, const Value &value) {
        if (auto *existing = find(key)) {
            *existing = value;
            return;
        }
        index_.insert(key, static_cast<qsizetype>(entries_.size()));
        entries_.emplace_back(key, value);
    }
    std::size_t size() const {
        return entries_.size();
    }
    const std::vector<std::pair<QString, Value>> &entries() const {
        return entries_;
    }

  private:
    QHash<QString, qsizetype> index_;
    std::vector<std::pair<QString, Value>> entries_;
};

// stores/formatNodeDocumentation.ts formatNodeDocumentation.
void splitDocumentation(Meta &meta) {
    QStringList lines;
    for (const auto &line : meta.description.split('\n')) {
        lines.append(line.trimmed());
    }
    meta.cleanDescription = lines.value(0);
    QStringList tags;
    if (lines.size() > 1) {
        for (const auto &tag : lines[1].split(',')) {
            const auto trimmed = tag.trimmed();
            if (!trimmed.isEmpty()) {
                tags.append(trimmed);
            }
        }
    }
    meta.tags = tags.join(", ");
    qsizetype useCasesIndex = -1;
    for (qsizetype i = 0; i < lines.size(); ++i) {
        if (lines[i].startsWith("Use cases:")) {
            useCasesIndex = i;
            break;
        }
    }
    if (useCasesIndex < 0) {
        return;
    }
    QStringList useCaseLines;
    bool hasBullets = false;
    for (qsizetype i = useCasesIndex + 1; i < lines.size(); ++i) {
        if (lines[i].trimmed().isEmpty()) {
            continue;
        }
        useCaseLines.append(lines[i]);
        hasBullets = hasBullets || lines[i].startsWith('-');
    }
    if (!hasBullets) {
        meta.useCases = useCaseLines.join(' ');
        return;
    }
    static const QRegularExpression bullet("^-\\s*");
    QStringList bullets;
    for (auto line : useCaseLines) {
        if (line.startsWith('-')) {
            bullets.append(line.remove(bullet).trimmed());
        }
    }
    meta.useCases = bullets.join('\n');
}

// utils/ranking.ts searchTermsFromQuery.
QStringList searchTermsFromQuery(const QString &query) {
    const auto trimmed = query.trimmed();
    if (trimmed.isEmpty()) {
        return {};
    }
    QStringList terms{trimmed};
    static const QRegularExpression separators("[\\s,]+", QRegularExpression::UseUnicodePropertiesOption);
    for (const auto &part : trimmed.split(separators)) {
        const auto term = part.trimmed();
        if (!term.isEmpty() && !terms.contains(term)) {
            terms.append(term);
        }
    }
    return terms;
}

const QSet<QString> &stopWords() {
    static const QSet<QString> words{"a",   "an",   "the",  "is",   "in",  "on",  "of",   "for",  "and",
                                     "or",  "by",   "with", "from", "at",  "as",  "it",   "be",   "do",
                                     "no",  "so",   "if",   "up",   "to",  "not", "but",  "are",  "was",
                                     "has", "its",  "all",  "into", "that", "this", "can", "will", "may"};
    return words;
}

// utils/PrefixTreeSearch.ts PrefixTreeSearch with nodeSearch.ts PREFIX_TREE_FIELDS.
class PrefixTree {
  public:
    struct Result {
        const Meta *meta = nullptr;
        double score = 0;
        QString field;
        bool exact = false;
    };
    explicit PrefixTree(const std::vector<Meta> &nodes) {
        for (const auto &field : fields()) {
            roots_.push_back(std::make_unique<Trie>());
            auto *root = roots_.back().get();
            for (const auto &meta : nodes) {
                for (const auto &value : values(meta, field.first)) {
                    if (!value.isEmpty()) {
                        insert(root, value, meta, field.second);
                    }
                }
            }
        }
    }
    std::vector<Result> search(const QString &query, std::size_t maxResults) const {
        if (query.trimmed().isEmpty()) {
            return {};
        }
        const auto normalized = query.toLower().trimmed();
        OrderedMap<Result> results;
        for (std::size_t i = 0; i < fields().size(); ++i) {
            const Trie *current = roots_[i].get();
            for (const auto character : normalized.toUcs4()) {
                const auto child = current->index.find(character);
                if (child == current->index.end()) {
                    current = nullptr;
                    break;
                }
                current = current->children[child->second].second.get();
            }
            if (current) {
                collect(*current, normalized, fields()[i].first, results, maxResults);
            }
        }
        std::vector<Result> sorted;
        for (const auto &entry : results.entries()) {
            sorted.push_back(entry.second);
        }
        std::stable_sort(sorted.begin(), sorted.end(),
                         [](const Result &a, const Result &b) { return b.score < a.score; });
        if (sorted.size() > maxResults) {
            sorted.resize(maxResults);
        }
        return sorted;
    }

  private:
    struct Ref {
        const Meta *meta = nullptr;
        double score = 0;
    };
    struct Trie {
        std::vector<std::pair<char32_t, std::unique_ptr<Trie>>> children;
        std::unordered_map<char32_t, std::size_t> index;
        OrderedMap<Ref> refs;
        bool endOfWord = false;
    };
    static const std::vector<std::pair<QString, double>> &fields() {
        static const std::vector<std::pair<QString, double>> list{
            {"title", 1.0}, {"namespace", 0.8}, {"description", 0.4}};
        return list;
    }
    static QStringList values(const Meta &meta, const QString &field) {
        static const QRegularExpression spaces("\\s+", QRegularExpression::UseUnicodePropertiesOption);
        if (field == "title") {
            QStringList list{meta.title, QString(meta.title).remove(spaces)};
            for (const auto &word : meta.title.split(spaces)) {
                if (!word.isEmpty() && !stopWords().contains(word.toLower())) {
                    list.append(word);
                }
            }
            return list;
        }
        if (field == "namespace") {
            QStringList list{meta.nameSpace};
            list.append(meta.nameSpace.split('.'));
            return list;
        }
        QStringList list;
        if (meta.description.isEmpty()) {
            return list;
        }
        for (const auto &word : meta.description.toLower().split(spaces)) {
            if (word.size() > 2 && !stopWords().contains(word)) {
                list.append(word);
            }
        }
        return list;
    }
    static void insert(Trie *root, const QString &word, const Meta &meta, double weight) {
        const auto normalized = word.toLower().trimmed();
        if (normalized.isEmpty()) {
            return;
        }
        auto *current = root;
        for (const auto character : normalized.toUcs4()) {
            const auto found = current->index.find(character);
            if (found == current->index.end()) {
                current->index.emplace(character, current->children.size());
                current->children.emplace_back(character, std::make_unique<Trie>());
                current = current->children.back().second.get();
            } else {
                current = current->children[found->second].second.get();
            }
            const auto *existing = current->refs.find(meta.nodeType);
            if (!existing || existing->score < weight) {
                current->refs.set(meta.nodeType, {&meta, weight});
            }
        }
        current->endOfWord = true;
    }
    static void collect(const Trie &node, const QString &prefix, const QString &field,
                        OrderedMap<Result> &results, std::size_t maxResults) {
        if (results.size() >= maxResults) {
            return;
        }
        for (const auto &[key, ref] : node.refs.entries()) {
            if (ref.score < 0.1) {
                continue;
            }
            const auto *existing = results.find(key);
            if (!existing || existing->score < ref.score) {
                const bool exact = node.endOfWord && ref.meta->title.toLower() == prefix;
                results.set(key, {ref.meta, ref.score, field, exact});
            }
        }
        for (const auto &child : node.children) {
            if (results.size() < maxResults) {
                collect(*child.second, prefix, field, results, maxResults);
            }
        }
    }
    std::vector<std::unique_ptr<Trie>> roots_;
};

// utils/bm25.ts tokenize.
QStringList tokenize(const QString &text) {
    static const QRegularExpression split(R"([\s.,;:!?\-_/(){}\[\]"'`<>@#$%^&*+=|\\~]+)",
                                          QRegularExpression::UseUnicodePropertiesOption);
    QStringList tokens;
    for (const auto &part : text.toLower().split(split)) {
        if (part.size() >= 2) {
            tokens.append(part);
        }
    }
    return tokens;
}

// utils/bm25.ts BM25Index built by buildNodeBM25Index.
class Bm25 {
  public:
    explicit Bm25(const std::vector<Meta> &nodes) : count_(static_cast<double>(nodes.size())) {
        std::vector<double> sums(fields().size(), 0);
        lengths_.assign(fields().size(), std::vector<int>(nodes.size(), 0));
        for (std::size_t doc = 0; doc < nodes.size(); ++doc) {
            QSet<QString> docTerms;
            for (std::size_t field = 0; field < fields().size(); ++field) {
                const auto tokens = tokenize(text(nodes[doc], fields()[field].first));
                lengths_[field][doc] = static_cast<int>(tokens.size());
                sums[field] += static_cast<double>(tokens.size());
                OrderedMap<int> frequencies;
                for (const auto &token : tokens) {
                    const auto *current = frequencies.find(token);
                    frequencies.set(token, current ? *current + 1 : 1);
                }
                for (const auto &[token, frequency] : frequencies.entries()) {
                    auto &perField = postings_[token];
                    if (perField.empty()) {
                        perField.resize(fields().size());
                    }
                    perField[field].emplace_back(doc, frequency);
                    docTerms.insert(token);
                }
            }
            for (const auto &token : docTerms) {
                ++frequency_[token];
            }
        }
        for (const auto sum : sums) {
            averages_.push_back(count_ > 0 ? sum / count_ : 0);
        }
    }
    std::vector<std::pair<std::size_t, double>> search(const QString &query, std::size_t limit) const {
        const auto terms = tokenize(query);
        if (terms.isEmpty() || count_ == 0) {
            return {};
        }
        constexpr double k1 = 1.5;
        constexpr double b = 0.75;
        std::vector<std::pair<std::size_t, double>> scores;
        std::unordered_map<std::size_t, std::size_t> positions;
        for (const auto &term : terms) {
            const auto df = frequency_.value(term);
            if (df == 0) {
                continue;
            }
            const double idf = std::log((count_ - df + 0.5) / (df + 0.5) + 1);
            const auto perField = postings_.constFind(term);
            if (perField == postings_.cend()) {
                continue;
            }
            for (std::size_t field = 0; field < fields().size(); ++field) {
                const auto &perDoc = (*perField)[field];
                if (perDoc.empty()) {
                    continue;
                }
                const double average = averages_[field] != 0 ? averages_[field] : 1;
                for (const auto &[doc, tf] : perDoc) {
                    const double length = lengths_[field][doc];
                    const double norm = 1 - b + b * (length / average);
                    const double tfScore = (tf * (k1 + 1)) / (tf + k1 * norm);
                    const auto position = positions.find(doc);
                    if (position == positions.end()) {
                        positions.emplace(doc, scores.size());
                        scores.emplace_back(doc, 0 + idf * tfScore * fields()[field].second);
                    } else {
                        auto &score = scores[position->second].second;
                        score = score + idf * tfScore * fields()[field].second;
                    }
                }
            }
        }
        std::stable_sort(scores.begin(), scores.end(),
                         [](const auto &a, const auto &b) { return b.second < a.second; });
        if (limit > 0 && scores.size() > limit) {
            scores.resize(limit);
        }
        return scores;
    }

  private:
    static const std::vector<std::pair<QString, double>> &fields() {
        static const std::vector<std::pair<QString, double>> list{{"title", 4.0},  {"node_type", 2.5},
                                                                  {"namespace", 1.5}, {"tags", 1.5},
                                                                  {"description", 0.8}, {"use_cases", 0.6}};
        return list;
    }
    static QString text(const Meta &meta, const QString &field) {
        if (field == "title") {
            return meta.title;
        }
        if (field == "node_type") {
            return meta.nodeType;
        }
        if (field == "namespace") {
            return meta.nameSpace;
        }
        if (field == "tags") {
            return meta.tags;
        }
        if (field == "description") {
            return meta.cleanDescription;
        }
        return meta.useCases;
    }
    double count_ = 0;
    std::vector<double> averages_;
    std::vector<std::vector<int>> lengths_;
    QHash<QString, std::vector<std::vector<std::pair<std::size_t, int>>>> postings_;
    QHash<QString, int> frequency_;
};

// utils/fuzzyMatch.ts fuzzyScore and its typo tier.
bool isWordCharCode(char16_t code) {
    return (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || (code >= 65 && code <= 90);
}
bool atWordBoundary(const QString &text, qsizetype index) {
    return index == 0 || !isWordCharCode(text[index - 1].unicode());
}
quint32 charMask(QStringView text) {
    quint32 mask = 0;
    for (const auto character : text) {
        mask |= 1u << (character.unicode() & 31);
    }
    return mask;
}
int editDistanceWithinBudget(QStringView a, QStringView b, int max) {
    const auto al = a.size();
    const auto bl = b.size();
    if (std::abs(al - bl) > max) {
        return max + 1;
    }
    std::vector<int> twoAgo(static_cast<std::size_t>(bl + 1));
    std::vector<int> oneAgo(static_cast<std::size_t>(bl + 1));
    std::vector<int> current(static_cast<std::size_t>(bl + 1));
    for (qsizetype j = 0; j <= bl; ++j) {
        oneAgo[j] = static_cast<int>(j);
    }
    for (qsizetype i = 1; i <= al; ++i) {
        current[0] = static_cast<int>(i);
        int rowMin = static_cast<int>(i);
        for (qsizetype j = 1; j <= bl; ++j) {
            const int cost = a[i - 1] == b[j - 1] ? 0 : 1;
            int distance = std::min({oneAgo[j] + 1, current[j - 1] + 1, oneAgo[j - 1] + cost});
            if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
                distance = std::min(distance, twoAgo[j - 2] + 1);
            }
            current[j] = distance;
            rowMin = std::min(rowMin, distance);
        }
        if (rowMin > max) {
            return max + 1;
        }
        std::swap(twoAgo, oneAgo);
        std::swap(oneAgo, current);
    }
    return oneAgo[static_cast<std::size_t>(bl)];
}
double typoScore(const QString &q, const QString &t) {
    const int budget = static_cast<int>(q.size() / 4);
    if (budget == 0) {
        return 0;
    }
    const auto queryMask = charMask(q);
    double best = 0;
    const auto consider = [&](QStringView unit, quint32 unitMask) {
        if (std::popcount(queryMask & ~unitMask) > budget) {
            return;
        }
        const int distance = editDistanceWithinBudget(q, unit, budget);
        if (distance > budget) {
            return;
        }
        const double similarity = 1 - double(distance) / double(std::max(q.size(), unit.size()));
        best = std::max(best, similarity);
    };
    if (std::abs(t.size() - q.size()) <= budget) {
        consider(t, charMask(t));
    }
    qsizetype wordStart = -1;
    quint32 wordMask = 0;
    for (qsizetype i = 0; i <= t.size(); ++i) {
        if (i < t.size()) {
            const auto code = t[i].unicode();
            if (isWordCharCode(code)) {
                if (wordStart == -1) {
                    wordStart = i;
                    wordMask = 0;
                }
                wordMask |= 1u << (code & 31);
                continue;
            }
        }
        if (wordStart != -1) {
            if (std::abs(i - wordStart - q.size()) <= budget) {
                consider(QStringView(t).mid(wordStart, i - wordStart), wordMask);
            }
            wordStart = -1;
        }
    }
    return 0.5 * best;
}
double fuzzyScore(const QString &query, const QString &text) {
    const auto q = query.trimmed().toLower();
    const auto t = text.toLower();
    if (q.isEmpty() || t.isEmpty()) {
        return 0;
    }
    if (q == t) {
        return 1;
    }
    const double affinity = double(q.size()) / double(t.size());
    if (t.startsWith(q)) {
        return 0.85 + 0.1 * affinity;
    }
    const auto substring = t.indexOf(q);
    if (substring != -1) {
        return atWordBoundary(t, substring) ? 0.7 + 0.1 * affinity : 0.55 + 0.1 * affinity;
    }
    qsizetype textIndex = 0;
    qsizetype firstMatch = -1;
    qsizetype previousMatch = -2;
    int consecutive = 0;
    int boundaryHits = 0;
    for (qsizetype queryIndex = 0; queryIndex < q.size(); ++queryIndex) {
        const auto character = q[queryIndex];
        while (textIndex < t.size() && t[textIndex] != character) {
            ++textIndex;
        }
        if (textIndex >= t.size()) {
            return typoScore(q, t);
        }
        if (firstMatch == -1) {
            firstMatch = textIndex;
        }
        if (textIndex == previousMatch + 1) {
            ++consecutive;
        }
        if (atWordBoundary(t, textIndex)) {
            ++boundaryHits;
        }
        previousMatch = textIndex;
        ++textIndex;
    }
    const double span = double(previousMatch - firstMatch + 1);
    const double density = double(q.size()) / span;
    const double consecutiveRatio = q.size() > 1 ? double(consecutive) / double(q.size() - 1) : 1;
    const double boundaryRatio = double(boundaryHits) / double(q.size());
    return 0.5 * (0.55 * density + 0.25 * consecutiveRatio + 0.15 * boundaryRatio + 0.05 * affinity);
}

using Boosts = OrderedMap<double>;
void addBoost(Boosts &boosts, const QString &nodeType, double boost) {
    const auto *current = boosts.find(nodeType);
    boosts.set(nodeType, std::max(current ? *current : 0, boost));
}

// nodeSearch.ts collectPrefixCandidateBoosts.
void prefixBoosts(Boosts &boosts, const std::vector<Meta> &nodes, const QStringList &terms) {
    QStringList normalized;
    for (const auto &term : terms) {
        if (!term.trimmed().isEmpty()) {
            normalized.append(term.trimmed());
        }
    }
    if (normalized.isEmpty()) {
        return;
    }
    const PrefixTree tree(nodes);
    const QHash<QString, double> fieldBoosts{{"title", 8}, {"namespace", 4}, {"description", 2}, {"tags", 3}};
    for (const auto &term : normalized) {
        for (const auto &result : tree.search(term, 150)) {
            addBoost(boosts, result.meta->nodeType,
                     fieldBoosts.value(result.field, 1) * result.score * (result.exact ? 2 : 1));
        }
    }
}

// nodeSearch.ts collectBM25CandidateBoosts.
void bm25Boosts(Boosts &boosts, const std::vector<Meta> &nodes, const QStringList &terms) {
    QStringList normalized;
    for (const auto &term : terms) {
        if (term.trimmed().size() >= 2) {
            normalized.append(term.trimmed());
        }
    }
    if (normalized.isEmpty() || nodes.empty()) {
        return;
    }
    const Bm25 index(nodes);
    for (const auto &term : normalized) {
        for (const auto &[doc, score] : index.search(term, 200)) {
            addBoost(boosts, nodes[doc].nodeType, score * 1.5);
        }
    }
}

// nodeSearch.ts collectFuzzyCandidateBoosts.
void fuzzyBoosts(Boosts &boosts, const std::vector<Meta> &nodes, const QStringList &terms) {
    QStringList normalized;
    for (const auto &term : terms) {
        if (term.trimmed().size() >= 3) {
            normalized.append(term.trimmed());
        }
    }
    const QHash<QString, double> fieldBoosts{
        {"title", 6}, {"namespace", 3}, {"tags", 3}, {"description", 1.5}, {"use_cases", 1.5}};
    for (const auto &term : normalized) {
        for (const auto &meta : nodes) {
            const std::vector<std::pair<QString, std::pair<const QString *, double>>> fields{
                {"title", {&meta.title, 1.0}},
                {"node_type", {&meta.nodeType, 0.9}},
                {"namespace", {&meta.nameSpace, 0.65}},
                {"tags", {&meta.tags, 0.55}},
                {"description", {&meta.cleanDescription, 0.25}},
                {"use_cases", {&meta.useCases, 0.25}}};
            double best = 0;
            QString bestField;
            for (const auto &[name, field] : fields) {
                const double raw = fuzzyScore(term, *field.first);
                if (raw < 0.3) {
                    continue;
                }
                const double weighted = raw * field.second;
                if (weighted > best) {
                    best = weighted;
                    bestField = name;
                }
            }
            if (best > 0) {
                addBoost(boosts, meta.nodeType, best * fieldBoosts.value(bestField, 1));
            }
        }
    }
}

// utils/ranking.ts fieldScore.
double fieldScore(const QString &field, const QStringList &lowerTerms, double weight) {
    if (field.isEmpty()) {
        return 0;
    }
    static const QRegularExpression separators("[\\s._\\-/]+", QRegularExpression::UseUnicodePropertiesOption);
    const auto lower = field.toLower();
    double score = 0;
    QStringList tokens;
    bool split = false;
    for (const auto &term : lowerTerms) {
        if (!lower.contains(term)) {
            continue;
        }
        score += weight;
        if (!split) {
            tokens = lower.split(separators, Qt::SkipEmptyParts);
            split = true;
        }
        if (tokens.contains(term)) {
            score += weight * 2;
        }
    }
    return score;
}

const QSet<QString> &quickActionNodeTypes() {
    // config/quickActionNodeTypes.ts QUICK_ACTION_NODE_TYPES.
    static const QSet<QString> types{"nodetool.agents.Agent",
                                     "nodetool.code.Code",
                                     "nodetool.image.TextToImage",
                                     "nodetool.image.ImageToImage",
                                     "nodetool.image.Upscale",
                                     "nodetool.image.RemoveBackground",
                                     "nodetool.image.Relight",
                                     "nodetool.image.Vectorize",
                                     "nodetool.video.TextToVideo",
                                     "nodetool.video.ImageToVideo",
                                     "nodetool.video.ReferenceToVideo",
                                     "nodetool.video.VideoToVideo",
                                     "nodetool.video.LipSync",
                                     "nodetool.audio.TextToSpeech",
                                     "nodetool.text.AutomaticSpeechRecognition",
                                     "fal.DynamicFal",
                                     "kie.dynamic_schema.KieAI",
                                     "replicate.DynamicReplicate",
                                     "nodetool.constant.Bool",
                                     "nodetool.constant.DataFrame",
                                     "nodetool.constant.Date",
                                     "nodetool.constant.DateTime",
                                     "nodetool.constant.Dict",
                                     "nodetool.constant.Audio",
                                     "nodetool.constant.Document",
                                     "nodetool.constant.Float",
                                     "nodetool.constant.Image",
                                     "nodetool.constant.Integer",
                                     "nodetool.constant.JSON",
                                     "nodetool.constant.List",
                                     "nodetool.constant.Model3D",
                                     "nodetool.constant.String",
                                     "nodetool.constant.Video"};
    return types;
}

// utils/nodeRanking.ts rankNodeMetadata through utils/ranking.ts rank.
std::vector<const Meta *> rankNodes(const std::vector<Meta> &nodes, const QStringList &terms, Boosts &boosts) {
    bool hasTerms = false;
    QStringList lowerTerms;
    for (const auto &term : terms) {
        hasTerms = hasTerms || !term.trimmed().isEmpty();
        if (!term.isEmpty()) {
            lowerTerms.append(term.toLower());
        }
    }
    std::vector<std::pair<const Meta *, double>> scored;
    for (const auto &meta : nodes) {
        if (meta.json["hidden"].toBool()) {
            continue;
        }
        const auto *candidate = boosts.find(meta.nodeType);
        const double candidateBoost = candidate ? *candidate : 0;
        double baseScore = 0;
        if (hasTerms && !lowerTerms.isEmpty()) {
            double raw = 0;
            raw += fieldScore(meta.title, lowerTerms, 6);
            raw += fieldScore(meta.nodeType, lowerTerms, 4);
            raw += fieldScore(meta.nameSpace, lowerTerms, 2);
            raw += fieldScore(meta.description, lowerTerms, 1);
            if (raw != 0) {
                double multiplier = meta.nameSpace.startsWith("nodetool.") || meta.nameSpace == "nodetool" ? 1.5 : 1;
                if (meta.json["deprecated"].toBool()) {
                    multiplier *= 0.15;
                }
                baseScore = raw * multiplier;
            }
        }
        if (hasTerms && baseScore == 0 && candidateBoost <= 0) {
            continue;
        }
        const double curated = quickActionNodeTypes().contains(meta.nodeType) ? 6 : 0;
        scored.emplace_back(&meta, baseScore + candidateBoost + 0 + curated);
    }
    std::stable_sort(scored.begin(), scored.end(), [](const auto &a, const auto &b) {
        if (b.second != a.second) {
            return b.second < a.second;
        }
        return localeCompare(a.first->nodeType, b.first->nodeType) < 0;
    });
    std::vector<const Meta *> ranked;
    for (const auto &entry : scored) {
        ranked.push_back(entry.first);
    }
    return ranked;
}

// nodeSearch.ts rankSearchNodes with no recent node types.
std::vector<const Meta *> rankSearchNodes(const std::vector<Meta> &nodes, const QString &term) {
    QStringList searchTerms{term};
    if (term.contains('.')) {
        const auto parts = term.split('.', Qt::SkipEmptyParts);
        if (!parts.isEmpty() && parts.last() != term) {
            searchTerms.append(parts.last());
        }
    }
    QStringList expanded;
    for (const auto &searchTerm : searchTerms) {
        expanded.append(searchTermsFromQuery(searchTerm));
    }
    Boosts boosts;
    const bool hasTerm = !term.trimmed().isEmpty();
    if (hasTerm) {
        prefixBoosts(boosts, nodes, expanded);
        Boosts bm25;
        bm25Boosts(bm25, nodes, expanded);
        for (const auto &[nodeType, boost] : bm25.entries()) {
            addBoost(boosts, nodeType, boost);
        }
    }
    auto ranked = rankNodes(nodes, expanded, boosts);
    if (term.trimmed().size() >= 3 && ranked.size() < 100) {
        Boosts fuzzy;
        fuzzyBoosts(fuzzy, nodes, expanded);
        for (const auto &[nodeType, boost] : fuzzy.entries()) {
            addBoost(boosts, nodeType, boost);
        }
        ranked = rankNodes(nodes, expanded, boosts);
    }
    return ranked;
}

QJsonObject typeOf(const QJsonValue &field) {
    return field.toObject()["type"].toObject();
}

// components/node_menu/typeFilterUtils.ts getInputMatchPriority and getOutputMatchPriority.
int matchPriority(const QJsonObject &wanted, const Meta &meta, bool output) {
    int best = 4;
    for (const auto &field : meta.json[output ? "outputs" : "properties"].toArray()) {
        const auto type = typeOf(field);
        const bool connectable = output ? node_editor::connectionTypesCompatible(type, wanted)
                                        : node_editor::connectionTypesCompatible(wanted, type);
        if (!connectable) {
            continue;
        }
        if (type["type"] == "any" && wanted["type"] != "any") {
            best = std::min(best, 3);
            continue;
        }
        if (type["type"] == wanted["type"]) {
            if (wanted["type"] != "enum" || type["type_name"] == wanted["type_name"]) {
                return 0;
            }
            best = std::min(best, 1);
        } else {
            best = std::min(best, 2);
        }
    }
    return best;
}

// typeFilterUtils.ts filterTypesByInputType and filterTypesByOutputType.
std::vector<Meta> filterConnectable(const std::vector<Meta> &nodes, const QString &name, bool output) {
    const QJsonObject wanted{{"type", name}, {"optional", true}, {"type_args", QJsonArray{}}, {"type_name", name}};
    std::vector<std::pair<int, const Meta *>> matches;
    for (const auto &meta : nodes) {
        const int priority = matchPriority(wanted, meta, output);
        bool connectable = false;
        for (const auto &field : meta.json[output ? "outputs" : "properties"].toArray()) {
            const auto type = typeOf(field);
            connectable = connectable || (output ? node_editor::connectionTypesCompatible(type, wanted)
                                                 : node_editor::connectionTypesCompatible(wanted, type));
        }
        if (connectable) {
            matches.emplace_back(priority, &meta);
        }
    }
    std::stable_sort(matches.begin(), matches.end(), [](const auto &a, const auto &b) {
        if (a.first != b.first) {
            return a.first < b.first;
        }
        return localeCompare(a.second->title, b.second->title) < 0;
    });
    std::vector<Meta> filtered;
    for (const auto &match : matches) {
        filtered.push_back(*match.second);
    }
    return filtered;
}

std::vector<Meta> filterExact(const std::vector<Meta> &nodes, const QString &name, bool output) {
    std::vector<Meta> filtered;
    for (const auto &meta : nodes) {
        const auto fields = meta.json[output ? "outputs" : "properties"].toArray();
        bool matches = output && name == "notype" && fields.isEmpty();
        for (const auto &field : fields) {
            matches = matches || (!(output && name == "notype") && typeOf(field)["type"] == name);
        }
        if (matches) {
            filtered.push_back(meta);
        }
    }
    return filtered;
}

// typeFilterUtils.ts filterDataByType and filterDataByExactType.
std::vector<Meta> filterByType(std::vector<Meta> nodes, const QString &inputType, const QString &outputType,
                               bool strict) {
    for (const bool output : {false, true}) {
        const auto &name = output ? outputType : inputType;
        if (name.isEmpty()) {
            continue;
        }
        if (strict || name == "any") {
            nodes = filterExact(nodes, name, output);
        } else {
            nodes = filterConnectable(nodes, name, output);
        }
    }
    return nodes;
}
} // namespace

QJsonArray computeNodeSearchResults(const QJsonArray &metadata, const QString &term, const QString &inputType,
                                    const QString &outputType, bool strictMatch) {
    // The web state keys metadata by node_type, so a repeated type keeps its
    // first position and its last value.
    std::vector<Meta> nodes;
    QHash<QString, std::size_t> positions;
    for (const auto &value : metadata) {
        const auto json = value.toObject();
        Meta meta;
        meta.json = json;
        meta.nodeType = json["node_type"].toString();
        meta.title = json["title"].toString();
        meta.nameSpace = json["namespace"].toString();
        meta.description = json["description"].toString();
        splitDocumentation(meta);
        const auto found = positions.constFind(meta.nodeType);
        if (found != positions.cend()) {
            nodes[*found] = meta;
            continue;
        }
        positions.insert(meta.nodeType, nodes.size());
        nodes.push_back(meta);
    }
    std::vector<Meta> visible;
    for (const auto &meta : nodes) {
        if (meta.nameSpace != "default") {
            visible.push_back(meta);
        }
    }
    const auto filtered = filterByType(visible, inputType, outputType, strictMatch);
    QJsonArray results;
    for (const auto *meta : rankSearchNodes(filtered, term)) {
        results.append(meta->json);
    }
    return results;
}
} // namespace nodetool
