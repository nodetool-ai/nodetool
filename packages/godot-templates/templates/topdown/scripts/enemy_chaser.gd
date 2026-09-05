extends CharacterBody2D

# HOOK: chasing enemy. Walks straight at the player once within SIGHT_RADIUS.
const SPEED := 90.0
const SIGHT_RADIUS := 320.0

var dead := false

@onready var sprite: AnimatedSprite2D = $Sprite
@onready var hitbox: Area2D = $Hitbox

func _ready() -> void:
	hitbox.body_entered.connect(_on_hitbox_body_entered)

func _physics_process(_delta: float) -> void:
	if dead:
		return
	var player := _find_player()
	if player == null or global_position.distance_to(player.global_position) > SIGHT_RADIUS:
		velocity = Vector2.ZERO
		sprite.stop()
		return
	var to_player := player.global_position - global_position
	velocity = to_player.normalized() * SPEED
	sprite.flip_h = to_player.x < 0.0
	if not sprite.is_playing():
		sprite.play(&"walk")
	move_and_slide()

func _find_player() -> Node2D:
	var players := get_tree().get_nodes_in_group("player")
	return players[0] if players.size() > 0 else null

func _on_hitbox_body_entered(body: Node2D) -> void:
	if not dead and body.is_in_group("player") and body.has_method("hurt"):
		body.hurt(global_position)

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
