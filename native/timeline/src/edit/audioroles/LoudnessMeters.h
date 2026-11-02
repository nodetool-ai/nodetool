#pragma once

// QML access to the loudness of the mix the audio device plays (issue #7080). The audio callback fills the
// readout (audio/loudness/LiveLoudness.h) with atomics, and this reads them. It never touches the audio thread
// and holds no lock.

#include <QElapsedTimer>
#include <QObject>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class LoudnessMeters : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit LoudnessMeters(QObject* parent = nullptr) : QObject(parent) {}
    // {available, active, momentary, shortTerm, integrated, maxMomentary, maxShortTerm, truePeakDb, loudnessRange}.
    // `available`: the device has played at least once. `active`: it played in the last moments, so the
    // momentary and short-term values are current. They read -Infinity when it is not playing.
    Q_INVOKABLE QVariantMap read();
    // Clears the integrated loudness, the maxima and the peak, and starts the measurement again.
    Q_INVOKABLE void reset();

private:
    quint64 m_blocks = 0;
    QElapsedTimer m_changed;
};
