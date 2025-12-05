using Godot;
using System;

public partial class BackButton : TextureButton
{
	private const string BRACKET_SCENE_PATH = "res://scenes/bracket_view.tscn";
	
	public override void _Pressed()
	{
		TransitionToBracket();
		base._Pressed();
	}
	
	private void TransitionToBracket()
	{
		GetTree().ChangeSceneToFile(BRACKET_SCENE_PATH);
	}
}
