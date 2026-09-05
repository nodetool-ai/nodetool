extends SceneTree

# Headless smoke test: godot --headless --path <dir> -s res://test/smoke.gd
# Loads the main scene, checks the nodes the template promises on the first
# frame (children are readied then, not in _initialize), runs 60 physics
# frames, exits 0. Any failure prints "SMOKE FAIL: ..." and exits 1.

const FRAMES := 60

var frames := 0
var done := false
var scene: Node

func _initialize() -> void:
	var packed: PackedScene = load("res://scenes/main.tscn")
	if packed == null:
		_fail("main.tscn did not load")
		return
	scene = packed.instantiate()
	root.add_child(scene)

func _physics_process(_delta: float) -> bool:
	if done:
		return true
	frames += 1
	if frames == 1:
		for path in EXPECTED:
			if scene.get_node_or_null(path) == null:
				_fail("missing node %s" % path)
				return true
		var problem := _check_start()
		if problem != "":
			_fail(problem)
			return true
		scene.start_game()
	if frames >= FRAMES:
		var problem := _check_end()
		if problem != "":
			_fail(problem)
			return true
		print("SMOKE OK: %d physics frames" % frames)
		done = true
		quit(0)
		return true
	return false

func _fail(message: String) -> void:
	printerr("SMOKE FAIL: " + message)
	done = true
	quit(1)

const EXPECTED := [
	"Level",
	"Level/Background/SpaceLayer/Space",
	"Level/Enemies",
	"Level/Bullets",
	"Level/Player",
	"Level/Player/Sprite",
	"Level/Player/Collision",
	"Level/Player/ShootSfx",
	"Level/Player/ExplodeSfx",
	"Level/SpawnTimer",
	"Music",
	"TitleLayer/Title",
]

var scroll_at_start := 0.0
var bullet: Node2D
var bullet_start_y := 0.0

func _check_start() -> String:
	var player_sprite: AnimatedSprite2D = scene.get_node("Level/Player/Sprite")
	if player_sprite.sprite_frames == null or not player_sprite.sprite_frames.has_animation(&"idle"):
		return "player sprite frames missing idle animation"
	var level: Node2D = scene.get_node("Level")
	if level.enemy_scene == null:
		return "level has no enemy scene"
	scroll_at_start = scene.get_node("Level/Background").scroll_base_offset.y
	scene.get_node("Level").spawn_enemy()
	scene.get_node("Level/Player").shoot()
	var bullets: Node2D = scene.get_node("Level/Bullets")
	if bullets.get_child_count() == 0:
		return "shoot() spawned no bullet"
	bullet = bullets.get_child(0)
	bullet_start_y = bullet.position.y
	return ""

func _check_end() -> String:
	if scene.get_node("Level/Enemies").get_child_count() == 0:
		return "spawned drone vanished"
	if is_instance_valid(bullet) and bullet.position.y >= bullet_start_y:
		return "fired bullet did not move up"
	if scene.get_node("Level/Background").scroll_base_offset.y <= scroll_at_start:
		return "background did not scroll"
	return ""
