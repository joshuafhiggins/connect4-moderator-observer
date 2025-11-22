extends TextureButton

@onready var label: Label = $Label

const DEFAULT_COLOR = Color(0.0, 0.6087, 0.9773, 1.0);
const HOVERED_COLOR = Color(0.29, 0.792, 1.0, 1.0);
const CLICKED_COLOR = Color(0.0, 0.243, 0.447, 1.0);

func onMouseEnter() -> void:
	label.add_theme_color_override("font_color", HOVERED_COLOR);

func onMouseExit() -> void:
	label.add_theme_color_override("font_color", DEFAULT_COLOR);

func onButtonDown() -> void:
	label.add_theme_color_override("font_color", CLICKED_COLOR);

func onButtonUp() -> void:
	if is_hovered():
		label.add_theme_color_override("font_color", HOVERED_COLOR);
	else:
		label.add_theme_color_override("font_color", DEFAULT_COLOR);
