extends Node2D

@onready var join_game_button: TextureButton = $JoinGameButton
@onready var create_game_button: TextureButton = $CreateGameButton

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	(join_game_button.get_node("Label") as Label).text = "JOIN";
	(create_game_button.get_node("Label") as Label).text = "HOST";


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass
