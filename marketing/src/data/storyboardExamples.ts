// The example storyboards on the landing page. The text and stills come
// from packages/base-nodes/nodetool/examples/storyboards/<slug>.storyboard.json
// and its package assets. The stills are copied to public/storyboards/<slug>/
// as 960px-wide WebP.

export interface StoryboardExampleShot {
  readonly slug: string;
  readonly action: string;
  readonly framing: string;
  readonly movement: string;
  readonly durationSeconds: number;
  readonly image: string;
}

export interface StoryboardExample {
  readonly slug: string;
  readonly name: string;
  readonly category: string;
  readonly brief: string;
  readonly still: { readonly width: number; readonly height: number };
  readonly shots: readonly StoryboardExampleShot[];
}

export const storyboardExamples: readonly StoryboardExample[] = [
  {
    slug: "rooftop-run",
    name: "Rooftop Run",
    category: "Action chase",
    brief:
      "A parkour runner crosses three rooftops at golden hour. One runner, one clear direction, and a single verb in every shot.",
    still: { width: 960, height: 540 },
    shots: [
      {
        slug: "Across the roof",
        action:
          "Runner sprinting across a flat rooftop toward the edge.",
        framing: "Wide shot",
        movement: "Drone follow from behind",
        durationSeconds: 3,
        image: "/storyboards/rooftop-run/across-the-roof.webp"
      },
      {
        slug: "The vault",
        action:
          "Runner vaulting over a metal AC unit.",
        framing: "Medium shot",
        movement: "Tracking side",
        durationSeconds: 3,
        image: "/storyboards/rooftop-run/the-vault.webp"
      },
      {
        slug: "The gap",
        action:
          "Runner mid-air leaping a gap between two buildings, street far below.",
        framing: "Wide shot",
        movement: "Static side, wide",
        durationSeconds: 4,
        image: "/storyboards/rooftop-run/the-gap.webp"
      },
      {
        slug: "The roll",
        action:
          "Runner rolling on landing.",
        framing: "Medium shot",
        movement: "Static",
        durationSeconds: 2,
        image: "/storyboards/rooftop-run/the-roll.webp"
      },
      {
        slug: "At the edge",
        action:
          "Runner standing at the roof edge, silhouetted against the sun.",
        framing: "Extreme wide shot",
        movement: "Drone pull back",
        durationSeconds: 3,
        image: "/storyboards/rooftop-run/at-the-edge.webp"
      }
    ]
  },
  {
    slug: "duel-in-the-wheat",
    name: "Duel in the Wheat",
    category: "Samurai film",
    brief:
      "Two swordsmen face off in a windblown wheat field. The fighters stay in separate shots until one beat of contact.",
    still: { width: 960, height: 411 },
    shots: [
      {
        slug: "Two in the wheat",
        action:
          "Two small figures far apart in the wheat, the ronin on the left, the duelist on the right, the tree between them on the horizon.",
        framing: "Extreme wide shot",
        movement: "Static",
        durationSeconds: 3,
        image: "/storyboards/duel-in-the-wheat/two-in-the-wheat.webp"
      },
      {
        slug: "The ronin",
        action:
          "The ronin alone in a medium close-up, scar over his left eye, hair stirring in the wind, facing right toward his unseen opponent, one hand resting on the hilt of his sheathed katana. Nobody else is in the frame.",
        framing: "Medium close-up",
        movement: "Static",
        durationSeconds: 3,
        image: "/storyboards/duel-in-the-wheat/the-ronin.webp"
      },
      {
        slug: "One strike",
        action:
          "Both men sprint toward each other through the wheat with drawn katanas, the ronin in indigo from the left and the duelist in crimson from the right. They meet in the middle and trade a fast exchange of blows, three clean steel-on-steel clashes with sparks, the duelist driving the ronin back a step, the ronin turning the blade aside. Then they pass each other in one final slash and run out of contact.",
        framing: "Wide shot",
        movement: "Fast lateral track that keeps both men in frame",
        durationSeconds: 6,
        image: "/storyboards/duel-in-the-wheat/one-strike.webp"
      },
      {
        slug: "The fall",
        action:
          "After the crossing, the duelist in crimson on the left sinks to one knee, head bowed, his sword hanging from his hand, while the ronin in indigo on the right stands with his back to him, sword lowered, seen from the same camera side as the first shot. They are far apart; wheat settling.",
        framing: "Wide shot",
        movement: "Static",
        durationSeconds: 3,
        image: "/storyboards/duel-in-the-wheat/the-fall.webp"
      }
    ]
  },
  {
    slug: "movement-in-gold",
    name: "Movement in Gold",
    category: "Luxury product ad",
    brief:
      "A luxury watch ad that treats the movement as the star. Macro gears and a sweeping second hand build to one calm shot on a wrist.",
    still: { width: 960, height: 540 },
    shots: [
      {
        slug: "Gear-turn",
        action:
          "Extreme macro of a gold gear train filling the whole frame, tiny red jewels glowing between the wheels. Only gears, no watch case or dial in the shot.",
        framing: "Extreme macro",
        movement: "Slow push in",
        durationSeconds: 4,
        image: "/storyboards/movement-in-gold/gear-turn.webp"
      },
      {
        slug: "Second-hand",
        action:
          "The thin second hand sweeps across the champagne dial, catching a bright glint at each marker.",
        framing: "Macro close-up",
        movement: "Rack focus from the hand to the dial edge",
        durationSeconds: 4,
        image: "/storyboards/movement-in-gold/second-hand.webp"
      },
      {
        slug: "Crown-detail",
        action:
          "The knurled gold crown of the watch stands perfectly still on the case edge, the gold shimmering as light glides across it, the thin second hand sweeping on the champagne dial behind. No people and no hands in the shot.",
        framing: "Close-up",
        movement: "Slow orbit left",
        durationSeconds: 3,
        image: "/storyboards/movement-in-gold/crown-detail.webp"
      },
      {
        slug: "On-the-wrist",
        action:
          "The watch lies on a dark table edge on a folded charcoal wool cloth, the dial glowing. No people, no wrist and no hands in the shot.",
        framing: "Medium close-up",
        movement: "Slow pull back",
        durationSeconds: 4,
        image: "/storyboards/movement-in-gold/on-the-wrist.webp"
      }
    ]
  },
  {
    slug: "silent-arrival",
    name: "Silent Arrival",
    category: "Automotive ad",
    brief:
      "An electric car ad about silence. A sleek car crosses a desert road at dawn and the quiet does the selling.",
    still: { width: 960, height: 411 },
    shots: [
      {
        slug: "Empty-road",
        action:
          "A long straight desert road at first light, heat haze rising, the white car a tiny shape far down the asphalt.",
        framing: "Extreme wide shot",
        movement: "Static",
        durationSeconds: 4,
        image: "/storyboards/silent-arrival/empty-road.webp"
      },
      {
        slug: "Low-pass",
        action:
          "The car glides past very close to the camera at road level, sand lifting in a thin line behind it.",
        framing: "Low-angle wide shot",
        movement: "Static, car passes through frame",
        durationSeconds: 3,
        image: "/storyboards/silent-arrival/low-pass.webp"
      },
      {
        slug: "Calm-driver",
        action:
          "Through the side window the driver rests one hand on the wheel, golden light sliding across his face.",
        framing: "Medium close-up",
        movement: "Tracking alongside the window",
        durationSeconds: 4,
        image: "/storyboards/silent-arrival/calm-driver.webp"
      },
      {
        slug: "Dawn-flare",
        action:
          "The car crests a rise into the rising sun, a long anamorphic flare stretching across the frame.",
        framing: "Wide shot",
        movement: "Slow crane up over the road",
        durationSeconds: 4,
        image: "/storyboards/silent-arrival/dawn-flare.webp"
      }
    ]
  },
  {
    slug: "suite-morning",
    name: "Suite Morning",
    category: "Hospitality ad",
    brief:
      "A boutique hotel ad about the perfect first morning, from the drone reveal to coffee on the terrace.",
    still: { width: 960, height: 540 },
    shots: [
      {
        slug: "Hotel-from-above",
        action:
          "A drone shot starts close above the sea-facing terrace of the small white limestone hotel: two open white French doors with sheer curtains, the bistro table, the olive tree and the white balustrade at the cliff edge, the deep blue sea beyond. No people.",
        framing: "Aerial shot widening to an extreme wide shot",
        movement: "One long drone move that pulls far back and rises, zooming out from the terrace to the whole cliff, bay and coastline",
        durationSeconds: 6,
        image: "/storyboards/suite-morning/hotel-from-above.webp"
      },
      {
        slug: "Terrace-table",
        action:
          "On the limestone terrace a white ceramic cup of coffee with a thin curl of steam and a single golden croissant on a white plate rest on the round black bistro table, the calm blue sea behind. Nobody in the shot.",
        framing: "Close-up",
        movement: "Static, shallow depth of field",
        durationSeconds: 3,
        image: "/storyboards/suite-morning/terrace-table.webp"
      },
      {
        slug: "Guest-wakes",
        action:
          "The guest sits up in the king bed against the white pillows, smiling softly as she turns her face toward the open doors and the light.",
        framing: "Medium shot",
        movement: "Static, very slow drift to the right",
        durationSeconds: 3,
        image: "/storyboards/suite-morning/guest-wakes.webp"
      },
      {
        slug: "Balcony-view",
        action:
          "The guest stands at the limestone balustrade with her back to the camera, holding the coffee cup, looking out over the calm blue sea in the morning sun.",
        framing: "Wide shot",
        movement: "Slow crane up and back to reveal the coast",
        durationSeconds: 3,
        image: "/storyboards/suite-morning/balcony-view.webp"
      }
    ]
  },
  {
    slug: "under-the-bed",
    name: "Under the Bed",
    category: "Family animation",
    brief:
      "A kid shines a flashlight under the bed and finds a monster more scared than she is. One flashlight reveal and a stylised 3D look that stays consistent.",
    still: { width: 960, height: 540 },
    shots: [
      {
        slug: "Moonlit bedroom",
        action:
          "Dark bedroom in moonlight, Mia sitting up in bed holding a flashlight. The monster is not visible yet.",
        framing: "Wide shot",
        movement: "Static",
        durationSeconds: 3,
        image: "/storyboards/under-the-bed/moonlit-bedroom.webp"
      },
      {
        slug: "Flashlight on",
        action:
          "Mia leaning over the edge of the bed, flashlight in hand. The monster is not visible yet.",
        framing: "Medium shot",
        movement: "Slow push in",
        durationSeconds: 3,
        image: "/storyboards/under-the-bed/flashlight-on.webp"
      },
      {
        slug: "Eyes under the bed",
        action:
          "Flashlight beam under the bed revealing two big glowing green eyes in the dark.",
        framing: "Point-of-view shot",
        movement: "Handheld",
        durationSeconds: 3,
        image: "/storyboards/under-the-bed/eyes-under-the-bed.webp"
      },
      {
        slug: "Scared monster",
        action:
          "The purple monster hiding under the bed, covering its eyes with its paws, trembling, the bed frame and mattress edge above it.",
        framing: "Close-up",
        movement: "Static",
        durationSeconds: 3,
        image: "/storyboards/under-the-bed/scared-monster.webp"
      },
      {
        slug: "The teddy",
        action:
          "Mia holding out her teddy bear under the bed; the monster reaching for it.",
        framing: "Medium shot",
        movement: "Static",
        durationSeconds: 3,
        image: "/storyboards/under-the-bed/the-teddy.webp"
      }
    ]
  },
  {
    slug: "clay-monday",
    name: "Clay Monday",
    category: "Claymation comedy",
    brief:
      "A claymation character drags himself out of bed and makes coffee. Fifteen seconds of stop-motion that forgives imperfect motion and stays consistent.",
    still: { width: 960, height: 540 },
    shots: [
      {
        slug: "Alarm",
        action:
          "Pip asleep in bed under a felt cover; a round alarm clock on the nightstand.",
        framing: "Wide shot",
        movement: "Static",
        durationSeconds: 3,
        image: "/storyboards/clay-monday/alarm.webp"
      },
      {
        slug: "Out of bed",
        action:
          "Pip flopped face down on the floor beside the bed.",
        framing: "Medium shot",
        movement: "Static",
        durationSeconds: 3,
        image: "/storyboards/clay-monday/out-of-bed.webp"
      },
      {
        slug: "The kettle",
        action:
          "Pip shuffling to a tiny kettle on the counter.",
        framing: "Medium shot",
        movement: "Pan right",
        durationSeconds: 3,
        image: "/storyboards/clay-monday/the-kettle.webp"
      },
      {
        slug: "The pour",
        action:
          "Coffee pouring into a yellow mug, sculpted clay steam.",
        framing: "Close-up",
        movement: "Static",
        durationSeconds: 3,
        image: "/storyboards/clay-monday/the-pour.webp"
      },
      {
        slug: "First sip",
        action:
          "Pip sipping from the yellow mug.",
        framing: "Close-up",
        movement: "Push in",
        durationSeconds: 3,
        image: "/storyboards/clay-monday/first-sip.webp"
      }
    ]
  }
];
