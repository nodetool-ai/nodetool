extends Area2D

# HOOK: drone behaviour. Flies straight down with a sideways wobble and dies
# on the first bullet.
const SPEED := 120.0
const WOBBLE := 40.0

var dead := false
var time := 0.0
var start_x := 0.0

@onready var sprite: AnimatedSprite2D = $Sprite

func _ready() -> void:
	start_x = position.x
	area_entered.connect(_on_area_entered)

func _physics_process(delta: float) -> void:
	if dead:
		return
	time += delta
	position.y += SPEED * delta
	position.x = start_x + sin(time * 3.0) * WOBBLE
	if position.y > get_viewport_rect().size.y + 32.0:
		queue_free()

func _on_area_entered(area: Area2D) -> void:
	if area.is_in_group("bullets"):
		area.queue_free()
		die()

func die() -> void:
	if dead:
		return
	dead = true
	set_deferred("monitoring", false)
	set_deferred("monitorable", false)
	sprite.play(&"die")
	await sprite.animation_finished
	queue_free()
