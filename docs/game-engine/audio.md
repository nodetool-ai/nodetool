---
layout: page
title: "Audio"
permalink: /game-engine/audio
description: "Add music and sound effects, balance them with buses, and place sounds in 3D space."
---

Bind audio assets to named slots, then play them as scene music or from entity audio sources. Audio does not affect gameplay logic, so muting it never changes how a game plays or replays.

```json
{
  "music": { "assetId": "theme", "volume": 0.6, "fadeInTicks": 60 },
  "audioSource": { "assetId": "pickup", "onEvent": "collected", "volume": 1, "spatial": true,
                   "minDistance": 1, "maxDistance": 50 }
}
```

`music` belongs to the scene and `audioSource` to an entity. `maxDistance` must be greater than `minDistance`, and a cone's `outerAngle` must be at least its `innerAngle`. Validation rejects both otherwise.

![Audio routing diagram from scene music and entity effects through mixer buses to output](/assets/game-engine/audio-routing.svg)

*Scene music uses the music bus. Effects use sfx unless `assetBuses` picks another route.*

## Music

![Kindle scene inspector showing music volume and fade tick settings](/assets/game-engine/editor-2d.png)

*Scene music settings in the inspector.*

In the scene inspector, set the music slot, volume, and optional fade-in and fade-out ticks. Music starts when the scene starts. Pausing the game pauses the music, and reset starts it again from the beginning.

For a long track, add `streaming` with a loop start and an optional loop end, in seconds. The intro plays once, then the loop repeats. Leave streaming out for short tracks.

## Sound effects

An entity's `audioSource.onEvent` plays a sound when an event of that kind or a named trigger happens, such as `collected`. Repeated triggers overlap on separate voices, up to a voice cap. When the cap is reached, new sounds are dropped so the mix does not turn to noise.

Browsers often block sound until the player clicks or presses a key, so test in the real player after interacting. If a sound stays silent after that, check the player's console for a load or decode error.

## Mixing

The mixer has master, music, sfx, voice, and ui buses. A bus is a volume channel that sounds are routed through. You can add custom buses, each with a parent, a gain, a mute switch, a low-pass frequency, and a reverb send.

- A child bus is as loud as its own gain times its parent's gain. Muting sfx also mutes the buses under it.
- **Low-pass** cuts high frequencies, which makes a sound dull and muffled, like hearing it through a wall.
- **Reverb send** adds echo, as if the sound were in a large room.
- The master limiter stops loud peaks from distorting.

`assetBuses` routes an audio slot to a bus. Ducking lowers music while dialogue plays. Put dialogue on the voice bus to get the default ducking, or replace the rules for a different balance.

Mix snapshots save a set of bus settings, such as a muffled underwater mix. A trigger, a win, or a scene entry switches to a snapshot and fades over a number of ticks. The reserved base snapshot returns to the normal mix.

## 3D sound

Set `audioSource.spatial: true` to make a sound come from a position. The active camera is the listener, so the sound gets quieter and pans left or right as the player moves. Minimum and maximum distance, the distance model, and rolloff set how quickly it fades with distance. Doppler shifts pitch as a sound moves toward or away from the listener.

In 3D, a source can have a cone that points along its -Z axis. The sound is loudest inside the cone and quieter outside it. 2D ignores the cone. The event that triggers a sound carries the emitter's position, so a collectible can disappear and still sound from where it was.

Listen on both headphones and speakers, and test after exporting the game.
