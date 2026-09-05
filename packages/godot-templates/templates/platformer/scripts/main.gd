extends Node

# Title screen over the level; any move or jump input dismisses it.

@onready var title_layer: CanvasLayer = $TitleLayer
@onready var level: Node2D = $Level

func _ready() -> void:
	level.process_mode = Node.PROCESS_MODE_DISABLED

func _unhandled_input(event: InputEvent) -> void:
	if not title_layer.visible:
		return
	if event.is_action_pressed("jump") or event.is_action_pressed("move_left") or event.is_action_pressed("move_right"):
		start_game()

func start_game() -> void:
	title_layer.visible = false
	level.process_mode = Node.PROCESS_MODE_INHERIT
