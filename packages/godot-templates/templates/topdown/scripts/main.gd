extends Node

# Title screen over the level; any move input dismisses it.

const START_ACTIONS := ["move_left", "move_right", "move_up", "move_down"]

@onready var title_layer: CanvasLayer = $TitleLayer
@onready var level: Node2D = $Level

func _ready() -> void:
	level.process_mode = Node.PROCESS_MODE_DISABLED

func _unhandled_input(event: InputEvent) -> void:
	if not title_layer.visible:
		return
	for action in START_ACTIONS:
		if event.is_action_pressed(action):
			start_game()
			return

func start_game() -> void:
	title_layer.visible = false
	level.process_mode = Node.PROCESS_MODE_INHERIT
