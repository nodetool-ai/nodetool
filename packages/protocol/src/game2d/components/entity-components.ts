import { gameSpriteComponent } from "./sprite.js";
import { gameTilemapComponent } from "./tilemap.js";
import { gameCamera2dComponent } from "./camera2d.js";
import { gameBody2dComponent } from "./body2d.js";
import { gameCollider2dComponent } from "./collider2d.js";
import { gameAnimatorComponent } from "./animator.js";
import { gameLight2dComponent } from "./light2d.js";
import { gameVisualAnimationComponent } from "./visual-animation.js";
import { gameAudioSourceComponent } from "./audioSource.js";
import { gameParticles } from "../../game-particles.js";

export const gameEntityComponents = {
  sprite: gameSpriteComponent,
  tilemap: gameTilemapComponent,
  camera2d: gameCamera2dComponent,
  body2d: gameBody2dComponent,
  collider2d: gameCollider2dComponent,
  animator: gameAnimatorComponent,
  light2d: gameLight2dComponent,
  visualAnimation: gameVisualAnimationComponent,
  audioSource: gameAudioSourceComponent,
  particles: gameParticles.optional()
};
