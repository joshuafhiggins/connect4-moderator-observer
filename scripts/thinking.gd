extends Label

@export var hue = 0.0

func _process(delta):
	modulate = Color.from_hsv(hue, 1.0, 1.0, 1.0)
	if hue < 1.0:
		hue += 0.1 * delta
	else:
		hue = 0.0
