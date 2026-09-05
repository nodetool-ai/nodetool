extends Area2D

# HOOK: ship handling. Moves in eight directions inside the viewport and
# fires while shoot is held, one bullet per FireTimer.
const SPEED := 260.0
const MUZZLE_OFFSET := Vector2(0, -18)
const INVULNERABLE_SECONDS := 1.5

@export var bullet_scene: PackedScene

var invulnerable_left := 0.0

@onready var sprite: AnimatedSprite2D = $Sprite
@onready var shoot_sfx: AudioStreamPlayer = $ShootSfx
@onready var explode_sfx: AudioStreamPlayer = $ExplodeSfx
@onready var fire_timer: Timer = $FireTimer

func _ready() -> void:
	area_entered.connect(_on_area_entered)

func _physics_process(delta: float) -> void:
	if invulnerable_left > 0.0:
		invulnerable_left -= delta
	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	position += input * SPEED * delta
	var bounds := get_viewport_rect().size
	position = position.clamp(Vector2(16, 16), bounds - Vector2(16, 16))
	if input.x < 0.0:
		sprite.play(&"bank_left")
	elif input.x > 0.0:
		sprite.play(&"bank_right")
	else:
		sprite.play(&"idle")
	if Input.is_action_pressed("shoot") and fire_timer.is_stopped():
		shoot()

func shoot() -> void:
	if bullet_scene == null:
		return
	var bullet: Node2D = bullet_scene.instantiate()
	bullet.global_position = global_position + MUZZLE_OFFSET
	var bullets := get_parent().get_node_or_null("Bullets")
	if bullets == null:
		bullets = get_parent()
	bullets.add_child(bullet)
	fire_timer.start()
	shoot_sfx.play()

func _on_area_entered(area: Area2D) -> void:
	if area.is_in_group("enemies"):
		hurt()

# HOOK: called on enemy contact.
func hurt() -> void:
	if invulnerable_left > 0.0:
		return
	invulnerable_left = INVULNERABLE_SECONDS
	explode_sfx.play()
