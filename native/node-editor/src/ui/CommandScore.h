#pragma once
// Fuzzy command scoring matching the web command palette's cmdk command-score
// algorithm (node_modules/cmdk/dist/command-score). Pure stateless functions;
// safe on any thread.
#include <QString>
#include <QStringList>
#include <algorithm>
#include <cmath>
#include <vector>

namespace nodetool::command_menu {

namespace detail {
constexpr double kScoreContinueMatch = 1.0;
constexpr double kScoreSpaceWordJump = 0.9;
constexpr double kScoreNonSpaceWordJump = 0.8;
constexpr double kScoreCharacterJump = 0.17;
constexpr double kScoreTransposition = 0.1;
constexpr double kPenaltySkipped = 0.999;
constexpr double kPenaltyCaseMismatch = 0.9999;
constexpr double kPenaltyNotComplete = 0.99;

inline bool isGapChar(QChar ch) {
    switch (ch.unicode()) {
    case '\\':
    case '/':
    case '_':
    case '+':
    case '.':
    case '#':
    case '"':
    case '@':
    case '[':
    case '(':
    case '{':
    case '&':
        return true;
    default:
        return false;
    }
}

inline bool isSpaceChar(QChar ch) {
    return ch.isSpace() || ch == QLatin1Char('-');
}

inline QString formatInput(const QString &value) {
    QString out = value.toLower();
    for (QChar &ch : out) {
        if (isSpaceChar(ch)) {
            ch = QLatin1Char(' ');
        }
    }
    return out;
}

inline int countMatching(const QString &value, qsizetype start, qsizetype end, bool (*predicate)(QChar)) {
    int count = 0;
    for (qsizetype i = start; i < end; ++i) {
        if (predicate(value.at(i))) {
            ++count;
        }
    }
    return count;
}

inline double scoreInner(const QString &candidate,
                         const QString &query,
                         const QString &lowerCandidate,
                         const QString &lowerQuery,
                         qsizetype candidateIndex,
                         qsizetype queryIndex,
                         std::vector<double> &memo) {
    const qsizetype candidateLen = candidate.size();
    const qsizetype queryLen = query.size();
    if (queryIndex == queryLen) {
        return candidateIndex == candidateLen ? kScoreContinueMatch : kPenaltyNotComplete;
    }
    const std::size_t cell = static_cast<std::size_t>(candidateIndex) * static_cast<std::size_t>(queryLen + 1)
        + static_cast<std::size_t>(queryIndex);
    if (memo[cell] >= 0.0) {
        return memo[cell];
    }

    const QChar needle = lowerQuery.at(queryIndex);
    qsizetype index = lowerCandidate.indexOf(needle, candidateIndex);
    double highScore = 0.0;

    while (index >= 0) {
        double score = scoreInner(candidate, query, lowerCandidate, lowerQuery, index + 1, queryIndex + 1, memo);
        if (score > highScore) {
            if (index == candidateIndex) {
                score *= kScoreContinueMatch;
            } else if (isGapChar(candidate.at(index - 1))) {
                score *= kScoreNonSpaceWordJump;
                const int breaks = countMatching(candidate, candidateIndex, index - 1, isGapChar);
                if (breaks > 0 && candidateIndex > 0) {
                    score *= std::pow(kPenaltySkipped, breaks);
                }
            } else if (isSpaceChar(candidate.at(index - 1))) {
                score *= kScoreSpaceWordJump;
                const int spaces = countMatching(candidate, candidateIndex, index - 1, isSpaceChar);
                if (spaces > 0 && candidateIndex > 0) {
                    score *= std::pow(kPenaltySkipped, spaces);
                }
            } else {
                score *= kScoreCharacterJump;
                if (candidateIndex > 0) {
                    score *= std::pow(kPenaltySkipped, static_cast<int>(index - candidateIndex));
                }
            }
            if (candidate.at(index) != query.at(queryIndex)) {
                score *= kPenaltyCaseMismatch;
            }
        }

        if (index > 0 && queryIndex + 1 < queryLen) {
            const QChar prevChar = lowerCandidate.at(index - 1);
            const QChar nextNeedle = lowerQuery.at(queryIndex + 1);
            if ((score < kScoreTransposition && prevChar == nextNeedle)
                || (nextNeedle == needle && prevChar != needle)) {
                const double transposed = scoreInner(candidate, query, lowerCandidate, lowerQuery,
                                                     index + 1, queryIndex + 2, memo);
                if (transposed * kScoreTransposition > score) {
                    score = transposed * kScoreTransposition;
                }
            }
        }

        if (score > highScore) {
            highScore = score;
        }
        index = lowerCandidate.indexOf(needle, index + 1);
    }

    memo[cell] = highScore;
    return highScore;
}
} // namespace detail

inline double commandScore(const QString &value, const QString &query, const QStringList &keywords = {}) {
    const QString trimmed = query.trimmed();
    if (trimmed.isEmpty()) {
        return 1.0;
    }
    constexpr qsizetype kMaxQueryLength = 128;
    const QString boundedQuery = trimmed.size() > kMaxQueryLength ? trimmed.left(kMaxQueryLength) : trimmed;
    const QString candidate = keywords.isEmpty() ? value : value + QLatin1Char(' ') + keywords.join(QLatin1Char(' '));
    const QString lowerCandidate = detail::formatInput(candidate);
    const QString lowerQuery = detail::formatInput(boundedQuery);
    std::vector<double> memo(
        static_cast<std::size_t>(candidate.size() + 1) * static_cast<std::size_t>(boundedQuery.size() + 1),
        -1.0);
    return detail::scoreInner(candidate, boundedQuery, lowerCandidate, lowerQuery, 0, 0, memo);
}

} // namespace nodetool::command_menu
