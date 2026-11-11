#pragma once
#include "AudioVisualAnalysis.h"
#include "PcmStream.h"
#include <QColor>
#include <QPointer>
#include <QQuickPaintedItem>
namespace nodetool::node_editor {
class LiveAudioVisualizer : public QQuickPaintedItem {
 Q_OBJECT
 Q_PROPERTY(PcmStream *controller READ controller WRITE setController NOTIFY controllerChanged)
 Q_PROPERTY(bool reducedMotion READ reducedMotion WRITE setReducedMotion NOTIFY appearanceChanged)
 Q_PROPERTY(QColor waveColor MEMBER waveColor_ NOTIFY appearanceChanged)
 Q_PROPERTY(QColor firstColor MEMBER firstColor_ NOTIFY appearanceChanged)
 Q_PROPERTY(QColor secondColor MEMBER secondColor_ NOTIFY appearanceChanged)
 Q_PROPERTY(QColor middleColor MEMBER middleColor_ NOTIFY appearanceChanged)
 Q_PROPERTY(QColor fourthColor MEMBER fourthColor_ NOTIFY appearanceChanged)
 Q_PROPERTY(QColor lastColor MEMBER lastColor_ NOTIFY appearanceChanged)
 Q_PROPERTY(qreal strokeWidth MEMBER strokeWidth_ NOTIFY appearanceChanged)
public:
 explicit LiveAudioVisualizer(QQuickItem *parent = nullptr);
 ~LiveAudioVisualizer() override;
 PcmStream *controller() const;
 void setController(PcmStream *controller);
 bool reducedMotion() const { return reducedMotion_; }
 void setReducedMotion(bool reduced);
 void paint(QPainter *painter) override;
signals:
 void controllerChanged();
 void appearanceChanged();
private:
 void updateObservation();
 void releaseObservation();
 void cacheFrame();
 QPointer<PcmStream> controller_;
 QMetaObject::Connection frameConnection_;
 QMetaObject::Connection destroyedConnection_;
 QMetaObject::Connection windowActiveConnection_;
 AudioVisualFrame frame_;
 bool observing_ = false;
 bool reducedMotion_ = false;
 bool observedAnimated_ = false;
 QColor waveColor_;
 QColor firstColor_;
 QColor secondColor_;
 QColor middleColor_;
 QColor fourthColor_;
 QColor lastColor_;
 qreal strokeWidth_ = 2;
};
}
