extends Node2D

# HOOK: scrolling and spawning. The background scrolls down forever; drones
# spawn at the top at random x every SpawnTimer tick.
const SCROLL_SPEED := 60.0
const SPAWN_MARGIN := 32.0

@export var enemy_scene: PackedScene

@onready var background: ParallaxBackground = $Background
@onready var enemies: Node2D = $Enemies
@onready var spawn_timer: Timer = $SpawnTimer

func _ready() -> void:
	spawn_timer.timeout.connect(spawn_enemy)

func _process(delta: float) -> void:
	background.scroll_base_offset.y += SCROLL_SPEED * delta

func spawn_enemy() -> void:
	if enemy_scene == null:
		return
	var enemy: Node2D = enemy_scene.instantiate()
	var width := get_viewport_rect().size.x
	enemy.position = Vector2(randf_range(SPAWN_MARGIN, width - SPAWN_MARGIN), -SPAWN_MARGIN)
	enemies.add_child(enemy)
