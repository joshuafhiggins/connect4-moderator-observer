using Godot;
using System;

public partial class ConnectButtonUI : Button
{
	[Export] public TextEdit AddressUi;
	[Export] public Label ErrorLabel;
	private const string BRACKET_SCENE_PATH = "res://scenes/bracket_view.tscn";
	
	public override void _Pressed()
	{
		if (Connection.Instance.Connect(AddressUi.Text))
		{
			GD.Print("Success!");
			GetTree().ChangeSceneToFile(BRACKET_SCENE_PATH);
		}
		else
		{
			ErrorLabel.Text = "Couldn't connect to server!";
		}
		base._Pressed();
	}
}
