extends CharacterBody2D

# HOOK: walking enemy. Walks in one direction, turns at ledges and walls.
const SPEED := 50.0
const GRAVITY := 900.0

var direction := -1.0
var dead := false

@onready var sprite: AnimatedSprite2D = $Sprite
@onready var edge_ray: RayCast2D = $EdgeRay
@onready var hitbox: Area2D = $Hitbox

func _ready() -> void:
	hitbox.body_entered.connect(_on_hitbox_body_entered)

func _physics_process(delta: float) -> void:
	if dead:
		return
	if not is_on_floor():
		velocity.y += GRAVITY * delta
	velocity.x = direction * SPEED
	move_and_slide()
	if is_on_floor() and (is_on_wall() or not edge_ray.is_colliding()):
		_turn()

func _turn() -> void:
	direction = -direction
	edge_ray.position.x = 14.0 * direction
	sprite.flip_h = direction > 0.0

func _on_hitbox_body_entered(body: Node2D) -> void:
	if not dead and body.is_in_group("player") and body.has_method("hurt"):
		body.hurt(global_position.x)

# HOOK: called when the player defeats this enemy.
func die() -> void:
	if dead:
		return
	dead = true
	velocity = Vector2.ZERO
	hitbox.set_deferred("monitoring", false)
	sprite.play(&"die")
	await sprite.animation_finished
	queue_free()
