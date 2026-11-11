#pragma once
// Text-based editing over the document's own data. The transcript is derived and never stored.
//
// Word timing comes from `clip.caption.words`: the transcription and voicing paths already write
// it, assist.removeFillers reads it, and split, trim and speed edits keep it valid. Times are
// local to the clip's start, so a move rewrites nothing. A document only gains the optional word
// field `cue`, which pins a caption boundary that the pause and length rules would not produce.
//
// Reading rules ported from FilmCraft crates/edit/src/transcript.rs (used under MIT, see
// licenses/FilmCraft-MIT.txt): a word belongs to a clip when its midpoint lies in the clip,
// its bounds are clamped to the clip, the search ignores case and punctuation and the last query
// word may be a prefix, and a selection snaps outward to frames.
#include <QJsonArray>
#include <QJsonObject>
#include <QString>
#include <optional>
#include <vector>

namespace nt::transcript {

struct Word {
    QString text;
    double startMs = 0;  // sequence time
    double endMs = 0;
    QString clipId;
    int wordIndex = 0;  // index in the clip's caption.words
    QString speaker;
    QString paragraphKey;
    bool operator==(const Word&) const = default;
};
struct Paragraph {
    int first = 0;
    int count = 0;
    QString speaker;
    double startMs = 0;
    bool operator==(const Paragraph&) const = default;
};
struct WordRange {
    int first = 0;
    int count = 0;
    bool operator==(const WordRange&) const = default;
};
struct TimeSpan {
    double startMs = 0;
    double endMs = 0;
    bool operator==(const TimeSpan&) const = default;
};
// One caption cue as the renderers show it. firstWord and wordCount index the clip's caption.words.
struct Cue {
    QString clipId;
    int firstWord = 0;
    int wordCount = 0;
    QString text;
    double startMs = 0;  // sequence time
    double endMs = 0;
    bool canSplit = false;
    bool canMerge = false;  // the next cue is in the same clip
    bool locked = false;
    bool operator==(const Cue&) const = default;
};

inline constexpr double PARAGRAPH_GAP_MS = 1500;
inline constexpr double CUE_GAP_MS = 700;  // CAPTION_CUE_GAP_MS in packages/timeline/src/render/sceneModel.ts
inline constexpr int CUE_MAX_WORDS = 10;   // CAPTION_CUE_MAX_WORDS

// Lowercase, with punctuation trimmed from both ends.
QString normalizedWord(const QString& text);
// Every word heard on the sequence, in time order. Audio tracks read first. A word repeated by an
// overlapping clip, such as a linked or duplicated dialogue clip, reads once. Disabled, reversed
// and time-remapped clips give no words, because their clip-local times do not match the picture.
std::vector<Word> sequenceWords(const QJsonObject& document);
// Words on those clips, which sequenceWords leaves out.
int hiddenWordCount(const QJsonObject& document);
// Runs split at a new speaker, a new clip paragraph, or a pause of gapMs. A long run ends at a
// sentence after softWords and always at hardWords, which bounds the layout cost of a paragraph.
std::vector<Paragraph> paragraphs(const std::vector<Word>& words, double gapMs = PARAGRAPH_GAP_MS,
                                  int softWords = 40, int hardWords = 120);
int paragraphOfWord(const std::vector<Paragraph>& paragraphs, int word);
// The word spoken at timeMs, or -1 in a pause.
int wordAt(const std::vector<Word>& words, double timeMs);
std::vector<WordRange> search(const std::vector<Word>& words, const QString& query);
// The span of words first to last, in either order, snapped outward to frames.
std::optional<TimeSpan> wordSpan(const std::vector<Word>& words, int first, int last, double fps);

// The raw indices of each cue in caption.words: the rules of captionCues in sceneModel.ts.
std::vector<std::vector<int>> captionCues(const QJsonArray& words, double durationMs);
std::vector<Cue> sequenceCues(const QJsonObject& document);

// Pure caption edits. Each returns the document unchanged when it refuses. The clip must be
// editable, and firstWord and wordCount must still name one cue of the clip.
QJsonObject setCueText(QJsonObject document, const QJsonObject& payload);   // clipId, firstWord, wordCount, text
QJsonObject setCueTimes(QJsonObject document, const QJsonObject& payload);  // + startMs, endMs in sequence time
QJsonObject splitCue(QJsonObject document, const QJsonObject& payload);     // + atWord: the first word of the new cue
QJsonObject mergeCue(QJsonObject document, const QJsonObject& payload);     // with the next cue of the clip
QJsonObject deleteCue(QJsonObject document, const QJsonObject& payload);
QJsonObject addCue(QJsonObject document, const QJsonObject& payload);       // atMs, text, optional durationMs

}  // namespace nt::transcript
