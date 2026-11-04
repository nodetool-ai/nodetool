#include "../../src/media/MediaResolver.h"
#include <QGuiApplication>
#include <QImage>
#include <QMediaPlayer>
#include <QAudioBufferOutput>
#include <QVideoSink>
#include <QSignalSpy>
#include <QtTest>
using namespace nodetool::node_editor;
int main(int argc, char **argv) {
 QGuiApplication app(argc, argv);
 const auto args = app.arguments();
 if (args.size() < 4) { qCritical("Usage: proof <server> <image-id> <audio-id> [video-id]"); return 2; }
 MediaResolver resolver;
 resolver.configure(QUrl(args[1]), {});
 QSignalSpy resolved(&resolver, &MediaResolver::resolved), failed(&resolver, &MediaResolver::failed);
 auto load = [&](const QString &key, const QVariant &source) {
  resolved.clear(); failed.clear();
  resolver.resolve(key, source);
  if (resolved.isEmpty() && !resolved.wait(10000)) { return QUrl{}; }
  return resolved[0][1].toUrl();
 };
 const auto image = load("image", "asset://" + args[2]);
 if (image.isEmpty() || QImage(image.toLocalFile()).size() != QSize(2, 2)) { qCritical("Live image resolve/decode failed"); return 1; }
 const auto audio = load("audio", QVariantMap{{"type", "audio"}, {"asset_id", args[3]}});
 if (audio.isEmpty()) { qCritical("Live audio resolve failed"); return 1; }
 QMediaPlayer player;
 QAudioBufferOutput output;
 player.setAudioBufferOutput(&output);
 QSignalSpy buffers(&output, &QAudioBufferOutput::audioBufferReceived);
 player.setSource(audio);
 player.play();
 if (buffers.isEmpty() && !buffers.wait(10000)) { qCritical("Live WAV decode failed"); return 1; }
 player.stop(); player.setSource({});
 qInfo("Live server asset:// PNG decoded 2x2 and typed audio asset decoded PCM");
 if (args.size() > 4) {
  const auto video = load("video", QVariantMap{{"type", "video"}, {"asset_id", args[4]}});
  if (video.isEmpty()) { qCritical("Live video resolve failed"); return 1; }
  QVideoSink sink;
  player.setVideoSink(&sink);
  QSignalSpy frames(&sink, &QVideoSink::videoFrameChanged);
  player.setSource(video); player.play();
  if (frames.isEmpty() && !frames.wait(10000)) { qCritical("Live video frame decode failed"); return 1; }
  player.stop(); player.setSource({});
  qInfo("Live typed video asset decoded a video frame");
 }
 return 0;
}
