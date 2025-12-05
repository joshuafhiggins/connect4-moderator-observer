using Godot;
using System;
using System.Collections.Generic;

public partial class AdminControls : HBoxContainer
{
	[Export] public Button BecomeAdmin;
	[Export] public Button StartTournament;
	[Export] public Label Label;
	[Export] public Slider Timeout;
	
	public override void _Ready()
	{
		Connection.Instance.OnBecomeAdmin += OnBecomeAdmin;
		Connection.Instance.OnTournamentEnd += OnEndTournament;
		
		StartTournament.Pressed += StartTournamentCommand;
		if (!Connection.Instance.IsAdmin || Connection.Instance.ActiveTournament)
		{
			StartTournament.Hide();
		}

		if (!Connection.Instance.IsAdmin)
		{
			Label.Hide();
			Timeout.Hide();
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
		Connection.Instance.OnTournamentEnd -= OnEndTournament;
	}

	private void StartTournamentCommand()
	{
		Connection.Instance.StartTournament();
	}

	private void OnEndTournament(List<(string, int)> playerScoreboard)
	{
		StartTournament.Show();
		ShowTournamentScoreboard(playerScoreboard);
	}

	private void ShowAuthPopup()
	{
		var authWindow = new Window();
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

	private void ShowTournamentScoreboard(List<(string, int)> playerScoreboard)
	{
		var scoreboardWindow = new Window();
		scoreboardWindow.AlwaysOnTop = true;
		scoreboardWindow.MaximizeDisabled = true;
		scoreboardWindow.Unresizable = true;
		scoreboardWindow.InitialPosition = Window.WindowInitialPosition.CenterMainWindowScreen;
		scoreboardWindow.Size = new Vector2I(256, 512);
		scoreboardWindow.CloseRequested += () =>
		{
			GetTree().Root.RemoveChild(scoreboardWindow);
		};
		
		var tree = new Tree();
		tree.HideRoot = true;
		tree.Columns = 2;
		tree.ColumnTitlesVisible = true;
		tree.SetColumnTitle(0, "Player");
		tree.SetColumnTitle(1, "Score");
		var root = tree.CreateItem();
		
		foreach ((string, int) entry in playerScoreboard)
		{
			var item = tree.CreateItem(root);
			item.SetText(0, entry.Item1);
			item.SetText(1, entry.Item2.ToString());
		}
		
		scoreboardWindow.AddChild(tree);
		
		GetTree().Root.AddChild(scoreboardWindow);
	}

	private void OnBecomeAdmin()
	{
		BecomeAdmin.Hide();
		if (!Connection.Instance.ActiveTournament)
		{
			StartTournament.Show();
		}
		Label.Show();
		Timeout.Show();
	}
}
