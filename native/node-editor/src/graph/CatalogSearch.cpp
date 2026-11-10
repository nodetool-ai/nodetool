#include "CatalogSearch.h"

#include <QCollator>
#include <QHash>
#include <QLocale>
#include <QRegularExpression>
#include <QSet>
#include <algorithm>
#include <optional>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>

namespace nodetool {
namespace {
// ---------------------------------------------------------------------------
// formatNodeDocumentation (web/src/stores/formatNodeDocumentation.ts)

struct Documentation {
    QString description;
    QString tags;
    QString useCases;
};

Documentation formatDocumentation(const QString &full) {
    QStringList lines = full.split(QLatin1Char('\n'));
    for (auto &line : lines) {
        line = line.trimmed();
    }
    Documentation doc;
    doc.description = lines.first();
    if (lines.size() > 1) {
        QStringList tags;
        for (const auto &tag : lines[1].split(QLatin1Char(','))) {
            const auto trimmed = tag.trimmed();
            if (!trimmed.isEmpty()) {
                tags << trimmed;
            }
        }
        doc.tags = tags.join(QStringLiteral(", "));
    }
    int useCases = -1;
    for (int i = 0; i < lines.size(); ++i) {
        if (lines[i].startsWith(QStringLiteral("Use cases:"))) {
            useCases = i;
            break;
        }
    }
    if (useCases >= 0) {
        QStringList body;
        bool bullets = false;
        for (int i = useCases + 1; i < lines.size(); ++i) {
            if (!lines[i].trimmed().isEmpty()) {
                body << lines[i];
                bullets = bullets || lines[i].startsWith(QLatin1Char('-'));
            }
        }
        if (bullets) {
            static const QRegularExpression dash(QStringLiteral("^-\\s*"));
            QStringList kept;
            for (auto line : body) {
                if (line.startsWith(QLatin1Char('-'))) {
                    kept << line.replace(dash, QString()).trimmed();
                }
            }
            doc.useCases = kept.join(QLatin1Char('\n'));
        } else {
            doc.useCases = body.join(QLatin1Char(' '));
        }
    }
    return doc;
}

// ---------------------------------------------------------------------------
// fuzzyScore (web/src/utils/fuzzyMatch.ts)

bool isWordChar(QChar c) {
    const auto code = c.unicode();
    return (code >= 'a' && code <= 'z') || (code >= '0' && code <= '9') || (code >= 'A' && code <= 'Z');
}

bool atWordBoundary(const QString &text, qsizetype index) {
    return index == 0 || !isWordChar(text[index - 1]);
}

uint32_t charBit(QChar c) {
    return uint32_t(1) << (c.unicode() & 31);
}

uint32_t charMask(const QString &s, qsizetype from, qsizetype to) {
    uint32_t mask = 0;
    for (qsizetype i = from; i < to; ++i) {
        mask |= charBit(s[i]);
    }
    return mask;
}

// Optimal string alignment distance, abandoned once every cell exceeds `max`.
int editDistanceWithinBudget(const QString &a, const QString &b, int max) {
    const int al = int(a.size());
    const int bl = int(b.size());
    if (std::abs(al - bl) > max) {
        return max + 1;
    }
    std::vector<int> twoAgo(bl + 1), oneAgo(bl + 1), current(bl + 1);
    for (int j = 0; j <= bl; ++j) {
        oneAgo[j] = j;
    }
    for (int i = 1; i <= al; ++i) {
        current[0] = i;
        int rowMin = i;
        for (int j = 1; j <= bl; ++j) {
            const int cost = a[i - 1] == b[j - 1] ? 0 : 1;
            int d = std::min({oneAgo[j] + 1, current[j - 1] + 1, oneAgo[j - 1] + cost});
            if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
                d = std::min(d, twoAgo[j - 2] + 1);
            }
            current[j] = d;
            rowMin = std::min(rowMin, d);
        }
        if (rowMin > max) {
            return max + 1;
        }
        std::swap(twoAgo, oneAgo);
        std::swap(oneAgo, current);
    }
    return oneAgo[bl];
}

double typoScore(const QString &q, const QString &t) {
    const int budget = int(q.size() / 4);
    if (budget == 0) {
        return 0;
    }
    const uint32_t qMask = charMask(q, 0, q.size());
    double best = 0;
    const auto consider = [&](const QString &unit, uint32_t unitMask) {
        if (std::popcount(qMask & ~unitMask) > budget) {
            return;
        }
        const int dist = editDistanceWithinBudget(q, unit, budget);
        if (dist > budget) {
            return;
        }
        const double similarity = 1.0 - double(dist) / double(std::max(q.size(), unit.size()));
        best = std::max(best, similarity);
    };
    if (std::abs(int(t.size() - q.size())) <= budget) {
        consider(t, charMask(t, 0, t.size()));
    }
    qsizetype wordStart = -1;
    uint32_t wordMask = 0;
    for (qsizetype i = 0; i <= t.size(); ++i) {
        if (i < t.size() && isWordChar(t[i])) {
            if (wordStart == -1) {
                wordStart = i;
                wordMask = 0;
            }
            wordMask |= charBit(t[i]);
            continue;
        }
        if (wordStart != -1) {
            if (std::abs(int(i - wordStart - q.size())) <= budget) {
                consider(t.mid(wordStart, i - wordStart), wordMask);
            }
            wordStart = -1;
        }
    }
    return 0.5 * best;
}

// ---------------------------------------------------------------------------
// BM25F index (web/src/utils/bm25.ts)

QStringList tokenize(const QString &text) {
    QStringList out;
    const QString lower = text.toLower();
    static const QString punctuation = QStringLiteral(".,;:!?-_/(){}[]\"'`<>@#$%^&*+=|\\~");
    qsizetype start = -1;
    for (qsizetype i = 0; i <= lower.size(); ++i) {
        const bool separator = i == lower.size() || lower[i].isSpace() || punctuation.contains(lower[i]);
        if (!separator) {
            if (start < 0) {
                start = i;
            }
            continue;
        }
        if (start >= 0 && i - start >= 2) {
            out << lower.mid(start, i - start);
        }
        start = -1;
    }
    return out;
}

constexpr int kBm25Fields = 6;
constexpr std::array<double, kBm25Fields> kBm25Weights{4.0, 2.5, 1.5, 1.5, 0.8, 0.6};

struct Bm25Index {
    struct Posting {
        int doc;
        int tf;
    };
    int docCount = 0;
    // term -> field -> postings in document order.
    QHash<QString, std::array<QList<Posting>, kBm25Fields>> postings;
    QHash<QString, int> docFreq;
    std::array<QList<int>, kBm25Fields> docLens;
    std::array<double, kBm25Fields> avgLen{};
};

// One BM25 field of one document: its token count and each distinct token with its count, in first-seen order.
struct FieldTerms {
    int length = 0;
    QList<std::pair<QString, int>> counts;
};

FieldTerms fieldTerms(const QString &text) {
    const auto tokens = tokenize(text);
    FieldTerms out{int(tokens.size()), {}};
    QHash<QString, int> at;
    for (const auto &token : tokens) {
        const auto found = at.constFind(token);
        if (found == at.constEnd()) {
            at.insert(token, int(out.counts.size()));
            out.counts.append({token, 1});
        } else {
            out.counts[found.value()].second += 1;
        }
    }
    return out;
}

Bm25Index buildBm25(const QList<const std::array<FieldTerms, kBm25Fields> *> &docs) {
    Bm25Index index;
    index.docCount = int(docs.size());
    std::array<double, kBm25Fields> sums{};
    for (int doc = 0; doc < docs.size(); ++doc) {
        QSet<QString> docTerms;
        for (int field = 0; field < kBm25Fields; ++field) {
            const auto &terms = (*docs[doc])[field];
            index.docLens[field].append(terms.length);
            sums[field] += double(terms.length);
            for (const auto &[token, tf] : terms.counts) {
                index.postings[token][field].append({doc, tf});
                docTerms.insert(token);
            }
        }
        for (const auto &token : docTerms) {
            index.docFreq[token] += 1;
        }
    }
    for (int field = 0; field < kBm25Fields; ++field) {
        index.avgLen[field] = index.docCount > 0 ? sums[field] / index.docCount : 0;
    }
    return index;
}

struct Bm25Result {
    int doc;
    double score;
};

constexpr double kK1 = 1.5;
constexpr double kB = 0.75;

QList<Bm25Result> searchBm25(const Bm25Index &index, const QString &query, int limit) {
    const auto terms = tokenize(query);
    if (terms.isEmpty() || index.docCount == 0) {
        return {};
    }
    // A document keeps the place where its first term hit it, which orders ties.
    QList<Bm25Result> scores;
    QHash<int, int> position;
    for (const auto &term : terms) {
        const int df = index.docFreq.value(term, 0);
        if (df == 0) {
            continue;
        }
        const double idf = std::log((index.docCount - df + 0.5) / (df + 0.5) + 1);
        const auto found = index.postings.constFind(term);
        if (found == index.postings.constEnd()) {
            continue;
        }
        for (int field = 0; field < kBm25Fields; ++field) {
            const double avg = index.avgLen[field] != 0 ? index.avgLen[field] : 1;
            for (const auto &posting : found.value()[field]) {
                const double dl = index.docLens[field][posting.doc];
                const double norm = 1 - kB + kB * (dl / avg);
                const double tfScore = (posting.tf * (kK1 + 1)) / (posting.tf + kK1 * norm);
                const auto at = position.constFind(posting.doc);
                if (at == position.constEnd()) {
                    position.insert(posting.doc, int(scores.size()));
                    scores.append({posting.doc, 0 + idf * tfScore * kBm25Weights[field]});
                } else {
                    scores[at.value()].score += idf * tfScore * kBm25Weights[field];
                }
            }
        }
    }
    std::stable_sort(scores.begin(), scores.end(), [](const auto &a, const auto &b) { return a.score > b.score; });
    if (limit > 0 && scores.size() > limit) {
        scores.resize(limit);
    }
    return scores;
}

// ---------------------------------------------------------------------------
// Indexes shared by the three boost passes. The web caches them per node set.

bool isSeparator(QChar c);

// One field of a node, lowercased, with its words split once (web utils/ranking.ts fieldScore).
struct RankField {
    QString lower;
    QSet<QString> tokens;
};

RankField rankField(const QString &field) {
    RankField out{field.toLower(), {}};
    qsizetype start = -1;
    for (qsizetype i = 0; i <= out.lower.size(); ++i) {
        if (i < out.lower.size() && !isSeparator(out.lower[i])) {
            if (start < 0) {
                start = i;
            }
            continue;
        }
        if (start >= 0) {
            out.tokens.insert(out.lower.mid(start, i - start));
        }
        start = -1;
    }
    return out;
}

const QCollator &typeCollator() {
    static const QCollator collator{QLocale{QLocale::English}};
    return collator;
}

// The cached work for one node: the rank fields, the collation key of its type
// and its parts of the boost index.
struct RankEntry {
    CatalogSearchNode node;
    std::array<RankField, 4> fields;
    QCollatorSortKey typeKey;
    QStringList titleWords, namespaceWords, descriptionWords;
    std::array<QString, 6> fuzzyFields;
    std::array<FieldTerms, kBm25Fields> bm25;
};

struct SearchIndex {
    QList<CatalogSearchNode> nodes;
    // Prefix tree words per field, lowercased and trimmed (utils/PrefixTreeSearch.ts getFieldValues).
    QList<QStringList> titleWords;
    QList<QStringList> namespaceWords;
    QList<QStringList> descriptionWords;
    Bm25Index bm25;
    // Fuzzy fields in the order title, node type, namespace, tags, description, use cases.
    QList<std::array<QString, 6>> fuzzyFields;
};

const QSet<QString> &stopWords() {
    static const QSet<QString> words{"a",   "an",   "the", "is",  "in",  "on",   "of",  "for",  "and",  "or",   "by",
                                     "with", "from", "at",  "as",  "it",  "be",   "do",  "no",   "so",   "if",   "up",
                                     "to",   "not",  "but", "are", "was", "has",  "its", "all",  "into", "that", "this",
                                     "can",  "will", "may"};
    return words;
}

QStringList normalizedWords(const QStringList &values) {
    QStringList out;
    for (const auto &value : values) {
        const auto normalized = value.toLower().trimmed();
        if (!normalized.isEmpty()) {
            out << normalized;
        }
    }
    return out;
}

RankEntry rankEntry(const CatalogSearchNode &node) {
    static const QRegularExpression whitespace(QStringLiteral("\\s+"));
    RankEntry entry{node,
                    {rankField(node.title), rankField(node.type), rankField(node.nameSpace), rankField(node.description)},
                    typeCollator().sortKey(node.type), {}, {}, {}, {}, {}};
    QStringList title{node.title, QString(node.title).remove(whitespace)};
    for (const auto &word : node.title.split(whitespace, Qt::SkipEmptyParts)) {
        if (!stopWords().contains(word.toLower())) {
            title << word;
        }
    }
    entry.titleWords = normalizedWords(title);
    entry.namespaceWords = normalizedWords(QStringList{node.nameSpace} + node.nameSpace.split(QLatin1Char('.')));
    QStringList description;
    for (const auto &word : node.description.toLower().split(whitespace, Qt::SkipEmptyParts)) {
        if (word.size() > 2 && !stopWords().contains(word)) {
            description << word;
        }
    }
    entry.descriptionWords = normalizedWords(description);
    const auto doc = formatDocumentation(node.description);
    entry.fuzzyFields = {node.title, node.type, node.nameSpace, doc.tags, doc.description, doc.useCases};
    for (int field = 0; field < kBm25Fields; ++field) {
        entry.bm25[field] = fieldTerms(entry.fuzzyFields[field]);
    }
    return entry;
}

SearchIndex buildIndex(const QList<CatalogSearchNode> &nodes, const QList<const RankEntry *> &entries) {
    SearchIndex index;
    index.nodes = nodes;
    QList<const std::array<FieldTerms, kBm25Fields> *> docs;
    docs.reserve(entries.size());
    for (const auto *entry : entries) {
        index.titleWords.append(entry->titleWords);
        index.namespaceWords.append(entry->namespaceWords);
        index.descriptionWords.append(entry->descriptionWords);
        index.fuzzyFields.append(entry->fuzzyFields);
        docs.append(&entry->bm25);
    }
    index.bm25 = buildBm25(docs);
    return index;
}

void raiseBoost(QList<double> &boosts, int node, double boost) {
    boosts[node] = std::max(boosts[node], boost);
}

// PrefixTreeSearch.search with maxResults 150, as collectPrefixCandidateBoosts calls it.
// A field's matches keep node order. A later field adds nothing once 150 are held.
void addPrefixBoosts(const SearchIndex &index, const QString &term, QList<double> &boosts) {
    constexpr int kMaxResults = 150;
    const auto query = term.toLower().trimmed();
    if (query.isEmpty()) {
        return;
    }
    struct Field {
        const QList<QStringList> *words;
        double weight;
        double boost;
    };
    const std::array<Field, 3> fields{Field{&index.titleWords, 1.0, 8}, Field{&index.namespaceWords, 0.8, 4},
                                      Field{&index.descriptionWords, 0.4, 2}};
    QList<std::pair<int, double>> results;
    QSet<int> held;
    for (const auto &field : fields) {
        if (results.size() >= kMaxResults) {
            break;
        }
        QList<std::pair<int, double>> added;
        for (int node = 0; node < index.nodes.size(); ++node) {
            if (held.contains(node)) {
                continue;
            }
            const auto &words = (*field.words)[node];
            const bool match = std::any_of(words.begin(), words.end(), [&](const QString &w) { return w.startsWith(query); });
            if (!match) {
                continue;
            }
            const bool exact = index.nodes[node].title.toLower() == query;
            added.append({node, field.boost * field.weight * (exact ? 2 : 1)});
        }
        for (const auto &entry : added) {
            held.insert(entry.first);
            results.append(entry);
        }
    }
    if (results.size() > kMaxResults) {
        results.resize(kMaxResults);
    }
    for (const auto &entry : results) {
        raiseBoost(boosts, entry.first, entry.second);
    }
}

void addBm25Boosts(const SearchIndex &index, const QStringList &terms, QList<double> &boosts) {
    constexpr double kScale = 1.5;
    for (const auto &raw : terms) {
        const auto term = raw.trimmed();
        if (term.size() < 2) {
            continue;
        }
        for (const auto &result : searchBm25(index.bm25, term, 200)) {
            raiseBoost(boosts, result.doc, result.score * kScale);
        }
    }
}

void addFuzzyBoosts(const SearchIndex &index, const QStringList &terms, QList<double> &boosts) {
    struct Weighted {
        int field;
        double weight;
        double boost;
    };
    // Field weights and the boost of the winning field (nodeSearch.ts).
    static constexpr std::array<Weighted, 6> kFields{Weighted{0, 1.0, 6.0},  Weighted{1, 0.9, 1.0}, Weighted{2, 0.65, 3.0},
                                                     Weighted{3, 0.55, 3.0}, Weighted{4, 0.25, 1.5}, Weighted{5, 0.25, 1.5}};
    constexpr double kMinFieldScore = 0.3;
    for (const auto &raw : terms) {
        const auto term = raw.trimmed();
        if (term.size() < 3) {
            continue;
        }
        for (int node = 0; node < index.nodes.size(); ++node) {
            double best = 0;
            double bestBoost = 1;
            for (const auto &field : kFields) {
                const double score = catalogFuzzyScore(term, index.fuzzyFields[node][field.field]);
                if (score < kMinFieldScore) {
                    continue;
                }
                const double weighted = score * field.weight;
                if (weighted > best) {
                    best = weighted;
                    bestBoost = field.boost;
                }
            }
            if (best > 0) {
                raiseBoost(boosts, node, best * bestBoost);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Query terms and field scores (web/src/utils/ranking.ts, nodeRanking.ts)

// searchTermsFromQuery: the trimmed query, then its whitespace and comma pieces.
QStringList termsFromQuery(const QString &query) {
    static const QRegularExpression separators(QStringLiteral("[\\s,]+"));
    const auto trimmed = query.trimmed();
    if (trimmed.isEmpty()) {
        return {};
    }
    QStringList terms{trimmed};
    for (const auto &piece : trimmed.split(separators)) {
        const auto term = piece.trimmed();
        if (!term.isEmpty() && !terms.contains(term)) {
            terms << term;
        }
    }
    return terms;
}

// rankSearchNodes: the query plus its last dotted segment, each expanded. The
// expansions are not merged, so a piece two expansions share counts twice.
QStringList expandedTerms(const QString &term) {
    QStringList searchTerms{term};
    if (term.contains(QLatin1Char('.'))) {
        QString last;
        for (const auto &part : term.split(QLatin1Char('.'))) {
            if (!part.isEmpty()) {
                last = part;
            }
        }
        if (!last.isEmpty() && last != term) {
            searchTerms << last;
        }
    }
    QStringList expanded;
    for (const auto &entry : searchTerms) {
        expanded << termsFromQuery(entry);
    }
    return expanded;
}

bool isSeparator(QChar c) {
    return c.isSpace() || c == QLatin1Char('.') || c == QLatin1Char('_') || c == QLatin1Char('-') || c == QLatin1Char('/');
}

double fieldScore(const RankField &field, const QStringList &lowerTerms, double weight) {
    if (field.lower.isEmpty()) {
        return 0;
    }
    double score = 0;
    for (const auto &term : lowerTerms) {
        if (!field.lower.contains(term)) {
            continue;
        }
        score += weight;
        if (field.tokens.contains(term)) {
            score += weight * 2;
        }
    }
    return score;
}

bool isCore(const QString &nameSpace) {
    return nameSpace.startsWith(QStringLiteral("nodetool.")) || nameSpace == QLatin1String("nodetool");
}

struct Scored {
    int node;
    double score;
};

QList<Scored> rankPass(const QList<CatalogSearchNode> &nodes, const QList<const RankEntry *> &entries,
                       const QStringList &terms, const QList<double> &boosts,
                       const QStringList &recent, const QStringList &boosted) {
    constexpr double kRecentBonus = 10;
    constexpr double kBoostedBonus = 6;
    QHash<QString, int> recentRank;
    for (int i = 0; i < recent.size(); ++i) {
        recentRank.insert(recent[i], i);
    }
    const QSet<QString> boostedKeys(boosted.begin(), boosted.end());
    bool hasTerms = false;
    QStringList lowerTerms;
    for (const auto &term : terms) {
        hasTerms = hasTerms || !term.trimmed().isEmpty();
        if (!term.isEmpty()) {
            lowerTerms << term.toLower();
        }
    }
    QList<Scored> scored;
    for (int i = 0; i < nodes.size(); ++i) {
        const auto &node = nodes[i];
        const double candidate = boosts.isEmpty() ? 0 : boosts[i];
        double base = 0;
        if (hasTerms && !lowerTerms.isEmpty()) {
            const auto &fields = entries[i]->fields;
            const double raw = fieldScore(fields[0], lowerTerms, 6) + fieldScore(fields[1], lowerTerms, 4) +
                               fieldScore(fields[2], lowerTerms, 2) + fieldScore(fields[3], lowerTerms, 1);
            if (raw != 0) {
                double multiplier = isCore(node.nameSpace) ? 1.5 : 1;
                if (node.deprecated) {
                    multiplier *= 0.15;
                }
                base = raw * multiplier;
            }
        }
        if (hasTerms && base == 0 && !(candidate > 0)) {
            continue;
        }
        const auto recentAt = recentRank.constFind(node.type);
        const double recency = recentAt == recentRank.constEnd() ? 0 : kRecentBonus / (recentAt.value() + 1);
        const double curated = boostedKeys.contains(node.type) ? kBoostedBonus : 0;
        scored.append({i, base + candidate + recency + curated});
    }
    // Ties order by node type with the locale collation JavaScript's localeCompare uses.
    // Each entry keeps its collation key, so the sort does not collate strings again.
    std::stable_sort(scored.begin(), scored.end(), [&](const Scored &a, const Scored &b) {
        if (a.score != b.score) {
            return a.score > b.score;
        }
        return entries[a.node]->typeKey.compare(entries[b.node]->typeKey) < 0;
    });
    return scored;
}
} // namespace

const QStringList &catalogQuickActionTypes() {
    static const QStringList types{
        "nodetool.agents.Agent", "nodetool.code.Code", "nodetool.image.TextToImage", "nodetool.image.ImageToImage",
        "nodetool.image.Upscale", "nodetool.image.RemoveBackground", "nodetool.image.Relight", "nodetool.image.Vectorize",
        "nodetool.video.TextToVideo", "nodetool.video.ImageToVideo", "nodetool.video.ReferenceToVideo",
        "nodetool.video.VideoToVideo", "nodetool.video.LipSync", "nodetool.audio.TextToSpeech",
        "nodetool.text.AutomaticSpeechRecognition", "fal.DynamicFal", "kie.dynamic_schema.KieAI",
        "replicate.DynamicReplicate", "nodetool.constant.Bool", "nodetool.constant.DataFrame", "nodetool.constant.Date",
        "nodetool.constant.DateTime", "nodetool.constant.Dict", "nodetool.constant.Audio", "nodetool.constant.Document",
        "nodetool.constant.Float", "nodetool.constant.Image", "nodetool.constant.Integer", "nodetool.constant.JSON",
        "nodetool.constant.List", "nodetool.constant.Model3D", "nodetool.constant.String", "nodetool.constant.Video"};
    return types;
}

double catalogFuzzyScore(const QString &query, const QString &text) {
    const QString q = query.trimmed().toLower();
    const QString t = text.toLower();
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
        const QChar ch = q[queryIndex];
        while (textIndex < t.size() && t[textIndex] != ch) {
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

struct CatalogRanker::State {
    // The boost index for the last node set. A new node set builds it again.
    std::optional<SearchIndex> index;
    // The rank fields of each node type. An entry stays while the node is unchanged.
    QHash<QString, RankEntry> entries;
};

CatalogRanker::CatalogRanker() : state_(std::make_unique<State>()) {}
CatalogRanker::~CatalogRanker() = default;

QList<int> CatalogRanker::rank(const QList<CatalogSearchNode> &nodes, const QString &query, const QStringList &recent,
                               const QStringList &boosted) {
    for (const auto &node : nodes) {
        const auto found = state_->entries.constFind(node.type);
        if (found == state_->entries.constEnd() || !(found->node == node)) {
            state_->entries.insert(node.type, rankEntry(node));
        }
    }
    // An insert can move the values, so take the pointers after the last insert.
    QList<const RankEntry *> entries;
    entries.reserve(nodes.size());
    for (const auto &node : nodes) {
        entries.append(&*state_->entries.constFind(node.type));
    }
    const auto terms = expandedTerms(query);
    QList<double> boosts;
    const bool hasQuery = !query.trimmed().isEmpty();
    const SearchIndex *index = nullptr;
    if (hasQuery && !nodes.isEmpty()) {
        if (!state_->index || state_->index->nodes != nodes) {
            state_->index = buildIndex(nodes, entries);
        }
        index = &*state_->index;
        boosts = QList<double>(nodes.size(), 0.0);
        for (const auto &term : terms) {
            if (!term.trimmed().isEmpty()) {
                addPrefixBoosts(*index, term, boosts);
            }
        }
        addBm25Boosts(*index, terms, boosts);
    }
    auto ranked = rankPass(nodes, entries, terms, boosts, recent, boosted);
    // The fuzzy pass runs only when the other signals left fewer than 100 results.
    if (index && query.trimmed().size() >= 3 && ranked.size() < 100) {
        addFuzzyBoosts(*index, terms, boosts);
        ranked = rankPass(nodes, entries, terms, boosts, recent, boosted);
    }
    QList<int> order;
    order.reserve(ranked.size());
    for (const auto &entry : ranked) {
        order.append(entry.node);
    }
    return order;
}

QList<int> rankCatalogNodes(const QList<CatalogSearchNode> &nodes, const QString &query, const QStringList &recent,
                            const QStringList &boosted) {
    return CatalogRanker().rank(nodes, query, recent, boosted);
}
} // namespace nodetool
