extends CharacterBody2D

# HOOK: tune movement here. Units are pixels and pixels per second.
const SPEED := 160.0
const JUMP_VELOCITY := -380.0
const GRAVITY := 900.0
const HURT_KNOCKBACK := Vector2(-120.0, -200.0)
const INVULNERABLE_SECONDS := 1.0

var invulnerable_left := 0.0

@onready var sprite: AnimatedSprite2D = $Sprite
@onready var jump_sfx: AudioStreamPlayer = $JumpSfx
@onready var hurt_sfx: AudioStreamPlayer = $HurtSfx

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y += GRAVITY * delta
	if invulnerable_left > 0.0:
		invulnerable_left -= delta

	var direction := Input.get_axis("move_left", "move_right")
	if invulnerable_left > 0.0 and sprite.animation == &"hurt":
		direction = 0.0
	velocity.x = direction * SPEED

	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = JUMP_VELOCITY
		jump_sfx.play()

	move_and_slide()
	_update_animation(direction)

func _update_animation(direction: float) -> void:
	if direction != 0.0:
		sprite.flip_h = direction < 0.0
	if sprite.animation == &"hurt" and sprite.is_playing():
		return
	if not is_on_floor():
		sprite.play(&"jump")
	elif direction != 0.0:
		sprite.play(&"run")
	else:
		sprite.play(&"idle")

# HOOK: called by enemies on contact.
func hurt(from_x: float = position.x - 1.0) -> void:
	if invulnerable_left > 0.0:
		return
	invulnerable_left = INVULNERABLE_SECONDS
	var away := 1.0 if position.x >= from_x else -1.0
	velocity = Vector2(HURT_KNOCKBACK.x * -away, HURT_KNOCKBACK.y)
	sprite.play(&"hurt")
	hurt_sfx.play()
