extends Node

# Title screen over the level; shoot dismisses it.

@onready var title_layer: CanvasLayer = $TitleLayer
@onready var level: Node2D = $Level

func _ready() -> void:
	level.process_mode = Node.PROCESS_MODE_DISABLED

func _unhandled_input(event: InputEvent) -> void:
	if title_layer.visible and event.is_action_pressed("shoot"):
		start_game()

func start_game() -> void:
	title_layer.visible = false
	level.process_mode = Node.PROCESS_MODE_INHERIT
