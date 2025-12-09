using Godot;

public partial class ConnectButtonUI : Button
{
	[Export] public TextEdit AddressField;
	[Export] public Label ErrorLabel;
	private const string BRACKET_SCENE_PATH = "res://scenes/bracket_view.tscn";

	public override void _Ready()
	{
		Connection.Instance.OnWsConnectionSuccess += OnConnectionSuccess;
		Connection.Instance.OnWsConnectionFailed += OnConnectionFailed;

		if (Connection.Instance.LastUsedConnectionAddress.Length > 0)
		{
			AddressField.Text = Connection.Instance.LastUsedConnectionAddress;
		}

		if (Connection.Instance.LastError.Length > 0)
		{
			ErrorLabel.Text = Connection.Instance.LastError;
		}

		AddressField.GuiInput += e =>
		{
			if (AddressField.HasFocus() && e is InputEventKey inputEventKey && inputEventKey.IsPressed())
			{
				if (inputEventKey.KeyLabel == Key.Enter)
				{
					Connection.Instance.Connect(AddressField.Text);
					GetViewport().SetInputAsHandled();
				}

				if (inputEventKey.KeyLabel == Key.Space)
				{
					GetViewport().SetInputAsHandled();
				}
			}
		};
	}

	public override void _ExitTree()
	{
		Connection.Instance.OnWsConnectionSuccess -= OnConnectionSuccess;
		Connection.Instance.OnWsConnectionFailed -= OnConnectionFailed;
	}

	public override void _Pressed()
	{
		Connection.Instance.Connect(AddressField.Text);
	}

	private void OnConnectionSuccess()
	{
		GetTree().ChangeSceneToFile(BRACKET_SCENE_PATH);
	}

	private void OnConnectionFailed()
	{
		ErrorLabel.Text = "Couldn't connect to server! " + Connection.Instance.LastError;
	}
}
