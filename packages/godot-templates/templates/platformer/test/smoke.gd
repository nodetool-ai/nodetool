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
	"Level/Ground",
	"Level/Player",
	"Level/Player/Sprite",
	"Level/Player/Collision",
	"Level/Player/JumpSfx",
	"Level/Player/HurtSfx",
	"Level/EnemyWalker",
	"Level/EnemyWalker/Sprite",
	"Level/EnemyWalker/EdgeRay",
	"Music",
	"TitleLayer/Title",
]

func _check_start() -> String:
	var player_sprite: AnimatedSprite2D = scene.get_node("Level/Player/Sprite")
	if player_sprite.sprite_frames == null or not player_sprite.sprite_frames.has_animation(&"idle"):
		return "player sprite frames missing idle animation"
	var ground: TileMapLayer = scene.get_node("Level/Ground")
	if ground.tile_set == null:
		return "ground has no tile set"
	if ground.get_used_cells().is_empty():
		return "level placed no tiles"
	return ""

func _check_end() -> String:
	var player: CharacterBody2D = scene.get_node("Level/Player")
	if not player.is_on_floor():
		return "player not standing on ground after %d frames" % frames
	if not is_instance_valid(scene.get_node_or_null("Level/EnemyWalker")):
		return "enemy vanished"
	return ""
