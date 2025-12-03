using Godot;
using System;

public partial class ConnectButtonUI : Button
{
	[Export] public TextEdit addressUI;
	[Export] public Label errorLabel;
	[Export] public PackedScene nextScene;
	
	public override void _Pressed()
	{
		if (Connection.Instance.Connect(addressUI.Text))
		{
			GD.Print("Success!");
			GetTree().ChangeSceneToPacked(nextScene);
		}
		else
		{
			errorLabel.Text = "Couldn't connect to server!";
		}
		base._Pressed();
	}
}
