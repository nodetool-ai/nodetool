extends Area2D

const SPEED := 520.0

func _physics_process(delta: float) -> void:
	position.y -= SPEED * delta
	if position.y < -32.0:
		queue_free()
