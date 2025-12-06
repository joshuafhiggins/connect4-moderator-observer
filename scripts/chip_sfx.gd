extends RigidBody2D

@export var audio_stream_player_2d: AudioStreamPlayer2D
@export var velocity_for_sfx: float = 2.0
@export var sounds: Array[AudioStream]

func _on_body_entered(body: Node) -> void:
	if body.name.begins_with("@RigidBody2D@") || body.name.begins_with("Floor"):
		var rng = RandomNumberGenerator.new()
		rng.randomize()
		var index = rng.randi_range(0, sounds.size() - 1)	
		audio_stream_player_2d.stream = sounds[index]
		audio_stream_player_2d.play();
