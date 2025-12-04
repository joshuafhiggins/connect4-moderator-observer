using Godot;
using System;

public partial class ConnectButtonUI : Button
{
	[Export] public TextEdit AddressUi;
	[Export] public Label ErrorLabel;
	[Export] public PackedScene NextScene;
	
	public override void _Pressed()
	{
		if (Connection.Instance.Connect(AddressUi.Text))
		{
			GD.Print("Success!");
			GetTree().ChangeSceneToPacked(NextScene);
		}
		else
		{
			ErrorLabel.Text = "Couldn't connect to server!";
		}
		base._Pressed();
	}
}
