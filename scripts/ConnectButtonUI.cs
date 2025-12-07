using Godot;

public partial class ConnectButtonUI : Button
{
	[Export] public TextEdit AddressField;
	[Export] public Label ErrorLabel;
	private const string BRACKET_SCENE_PATH = "res://scenes/bracket_view.tscn";

	public override void _Ready()
	{
		Connection.Instance.OnWSConnectionSuccess += () => GetTree().ChangeSceneToFile(BRACKET_SCENE_PATH);
		Connection.Instance.OnWSConnectionFailed += () => ErrorLabel.Text = "Couldn't connect to server! " + Connection.Instance.LastError;
	}

	public override void _Pressed()
	{
		Connection.Instance.Connect(AddressField.Text);
	}
}
