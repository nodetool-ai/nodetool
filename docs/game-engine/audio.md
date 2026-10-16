---
layout: page
title: "Music, Sound Effects, and Mixing"
permalink: /game-engine/audio
description: "Route game audio through buses, scene music, spatial emitters, and mix snapshots."
---

Bind prepared audio to logical slots, then use scene music or entity audio sources to play it. Audio is presentation state. It does not change simulation results or deterministic replay.

![Audio routing diagram from scene music and entity effects through mixer buses to output](/assets/game-engine/audio-routing.svg)

*Scene music uses the music bus. Effects use sfx unless the asset-to-bus map selects another route.*

## Play a scene track or effect

![Kindle scene inspector showing music volume and fade tick settings](/assets/game-engine/editor-2d.png)

*Scene music settings beside the paused Kindle viewport. This capture shows configuration, not an audio playback test. [Capture provenance](/game-engine/screenshots).*

Set `scene.music` to an audio slot, volume, and optional fade-in and fade-out ticks. Music starts at scene entry. Pause suspends playback, reset starts the entry scene again, and restore resumes from the logical tick.

An entity's `audioSource.onEvent` responds to an event kind or emitted trigger name. Effects have separate voices so repeated triggers can overlap within the voice cap. Inspect the actual player after a gesture: browsers may block sound until the player clicks or presses a key. A silent image capture is not an audio playback test.

For a long music track, add `streaming` with loop start and optional loop end in seconds. The intro plays once, then the loop repeats. Browser media events determine custom streaming loop boundaries. Omit streaming for decoded playback.

## Route and balance

The mixer supplies master, music, sfx, voice, and ui buses. Custom buses have a parent, gain, mute state, low-pass frequency, and reverb send. A child multiplies its parent's gain. Muting sfx also mutes its descendants.

`assetBuses` routes a slot to a bus. Put dialogue on voice to use the default music ducking rule. The master limiter controls peaks. Replace ducking rules when the game needs a different relationship.

Mix snapshots override selected bus fields. Transitions enter a snapshot on a trigger, win, or scene entry and fade over ticks. The reserved base snapshot restores the ordinary mix. Restoring a session resets the appropriate mix without saving an audio graph in gameplay state.

## Place sound in space

Set `audioSource.spatial: true` for position-aware playback. The active camera is the listener. Minimum and maximum distance, distance model, and rolloff control attenuation. Doppler can shift pitch with relative motion.

3D sources can have a cone pointing along their −Z axis. 2D ignores the cone. The triggering event includes the emitter position so a collectible can disappear and still sound from where it was collected.

Check sounds on headphones and speakers, during pause and recovery, and after export. A configured audio asset may still fail to load or decode. Use the player's diagnostics and console to distinguish that from browser gesture restrictions.
