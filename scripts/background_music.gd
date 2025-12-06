extends Node

func _ready() -> void:
	var music = AudioStreamPlayer.new()
	add_child(music)
	music.stream = load("res://assets/music/jazz_music.mp3")
	music.volume_db = -10
	music.play()
