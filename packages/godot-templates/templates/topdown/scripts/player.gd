extends CharacterBody2D

# HOOK: tune movement here. Eight-direction movement, normalised so diagonals
# are not faster.
const SPEED := 140.0
const STEP_INTERVAL := 0.3
const INVULNERABLE_SECONDS := 1.0
const HURT_KNOCKBACK := 180.0

var invulnerable_left := 0.0
var step_left := 0.0
var knockback := Vector2.ZERO

@onready var sprite: AnimatedSprite2D = $Sprite
@onready var hit_sfx: AudioStreamPlayer = $HitSfx
@onready var step_sfx: AudioStreamPlayer = $StepSfx

func _physics_process(delta: float) -> void:
	if invulnerable_left > 0.0:
		invulnerable_left -= delta
	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = input * SPEED + knockback
	knockback = knockback.move_toward(Vector2.ZERO, HURT_KNOCKBACK * 4.0 * delta)
	move_and_slide()
	_update_animation(input, delta)

func _update_animation(input: Vector2, delta: float) -> void:
	if input.x != 0.0:
		sprite.flip_h = input.x < 0.0
	if sprite.animation == &"hurt" and sprite.is_playing():
		return
	if input != Vector2.ZERO:
		sprite.play(&"walk")
		step_left -= delta
		if step_left <= 0.0:
			step_left = STEP_INTERVAL
			step_sfx.play()
	else:
		sprite.play(&"idle")
		step_left = 0.0

# HOOK: called by enemies on contact.
func hurt(from: Vector2) -> void:
	if invulnerable_left > 0.0:
		return
	invulnerable_left = INVULNERABLE_SECONDS
	var away := (global_position - from).normalized()
	if away == Vector2.ZERO:
		away = Vector2.LEFT
	knockback = away * HURT_KNOCKBACK
	sprite.play(&"hurt")
	hit_sfx.play()
