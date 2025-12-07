using Godot;

public partial class AdminControls : HBoxContainer
{
	[Export] public Button BecomeAdmin;
	[Export] public Button StartTournament;
	[Export] public Button CancelTournament;
	[Export] public Label Label;
	[Export] public Slider Timeout;
	
	public override void _Ready()
	{
		Connection.Instance.OnBecomeAdmin += OnBecomeAdmin;
		Connection.Instance.OnTournamentEnd += _ => StartTournament.Show();
		Connection.Instance.OnStartTournamentAck += () => StartTournament.Hide();
		
		StartTournament.Pressed += () => Connection.Instance.StartTournament();
		CancelTournament.Pressed += () => Connection.Instance.CancelTournament();
		if (!Connection.Instance.IsAdmin)
		{
			StartTournament.Hide();
			CancelTournament.Hide();
			Label.Hide();
			Timeout.Hide();
		} 
		else if (Connection.Instance.ActiveTournament)
		{
			StartTournament.Hide();
		}

		Timeout.Value = Connection.Instance.CurrentWaitTimeout;
		var time = Connection.Instance.CurrentWaitTimeout.ToString();
		if (time.Length > 3)
		{
			time = time.Substring(0, 3);
		}
		
		Label.Text = "Wait To Move: " + time + "s ";
		Timeout.ValueChanged += value =>
		{
			Connection.Instance.SetTournamentWait((float)value);
			var time = Connection.Instance.CurrentWaitTimeout.ToString();
			if (time.Length > 3)
			{
				time = time.Substring(0, 3);
			}
			Label.Text = "Wait To Move: " + time + "s ";
		};
		
		BecomeAdmin.Pressed += ShowAuthPopup;
	}
	
	public override void _ExitTree()
	{
		Connection.Instance.OnBecomeAdmin -= OnBecomeAdmin;
	}

	private void ShowAuthPopup()
	{
		var authWindow = new Window();
		authWindow.Theme = GD.Load<Theme>("res://assets/theme.tres");
		authWindow.AlwaysOnTop = true;
		authWindow.MaximizeDisabled = true;
		authWindow.Unresizable = true;
		authWindow.InitialPosition = Window.WindowInitialPosition.CenterMainWindowScreen;
		authWindow.Size = new Vector2I(256, 128);
		authWindow.CloseRequested += () =>
		{
			GetTree().Root.RemoveChild(authWindow);
		};
		
		var vbox = new VBoxContainer();
		vbox.LayoutMode = 1;
		vbox.AnchorBottom = 1.0f;
		vbox.AnchorRight = 1.0f;
		vbox.GrowHorizontal = GrowDirection.Both;
		vbox.GrowVertical = GrowDirection.Both;
		vbox.Alignment = AlignmentMode.Center;
		
		var passwordBox = new TextEdit();
		passwordBox.PlaceholderText = "Password";
		passwordBox.SetCustomMinimumSize(new Vector2(32, 32));
		
		var button = new Button();
		button.Text = "Login";
		button.Pressed += () =>
		{
			Connection.Instance.AdminAuth(passwordBox.Text);
			GetTree().Root.RemoveChild(authWindow);
		};
		
		vbox.AddChild(passwordBox);
		vbox.AddChild(button);
		
		authWindow.AddChild(vbox);
		
		GetTree().Root.AddChild(authWindow);
	}

	private void OnBecomeAdmin()
	{
		BecomeAdmin.Hide();
		if (!Connection.Instance.ActiveTournament)
		{
			StartTournament.Show();
		}
		else
		{
			CancelTournament.Show();
		}
		Label.Show();
		Timeout.Show();
	}
}
