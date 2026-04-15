using Godot;

public partial class AdminControls : HBoxContainer {
  [Export] public Button BecomeAdmin;
  [Export] public Button StartTournament;
  [Export] public Button CancelTournament;
  [Export] public Label Label;
  [Export] public Slider Timeout;

  public override void _Ready() {
	Connection.Instance.OnBecomeAdmin += UpdateUI;
	Connection.Instance.OnTournamentEnd += UpdateUI;
	Connection.Instance.OnStartTournament += UpdateUI;
	Connection.Instance.OnCancelTournamentAck += UpdateUI;
	Connection.Instance.OnGetDataAcks += UpdateUI;
	Connection.Instance.OnSetDataAcks += UpdateUI;

	StartTournament.Pressed += () => Connection.Instance.StartTournament();
	CancelTournament.Pressed += () => Connection.Instance.CancelTournament();

	UpdateUI();

	Timeout.ValueChanged += value =>
	{
	  Connection.Instance.SetMoveWait((float)value);
	  var time = Connection.Instance.CurrentWaitTimeout.ToString();
	  if (time.Length > 3) {
		time = time.Substring(0, 3);
	  }
	  Label.Text = "Wait To Move: " + time + "s ";
	};

	BecomeAdmin.Pressed += showAuthPopup;
  }

  public override void _ExitTree() {
	Connection.Instance.OnBecomeAdmin -= UpdateUI;
	Connection.Instance.OnTournamentEnd -= UpdateUI;
	Connection.Instance.OnStartTournament -= UpdateUI;
	Connection.Instance.OnCancelTournamentAck -= UpdateUI;
	Connection.Instance.OnGetDataAcks -= UpdateUI;
	Connection.Instance.OnSetDataAcks -= UpdateUI;
  }

  private void UpdateUI() {
	if (!Connection.Instance.IsAdmin) {
	  BecomeAdmin.Show();
	  StartTournament.Hide();
	  CancelTournament.Hide();
	  Label.Hide();
	  Timeout.Hide();
	} else {
	  BecomeAdmin.Hide();
	  Label.Show();
	  Timeout.Show();
	}

	if (Connection.Instance.IsAdmin && Connection.Instance.DemoMode) {
	  StartTournament.Hide();
	  CancelTournament.Hide();
	} else if (Connection.Instance.IsAdmin && Connection.Instance.ActiveTournament != TournamentType.None) {
	  StartTournament.Hide();
	  CancelTournament.Show();
	} else if (Connection.Instance.IsAdmin) {
	  StartTournament.Show();
	  CancelTournament.Hide();
	}

	Timeout.Value = Connection.Instance.CurrentWaitTimeout;
	var time = Connection.Instance.CurrentWaitTimeout.ToString();
	if (time.Length > 3) {
	  time = time.Substring(0, 3);
	}

	Label.Text = "Wait To Move: " + time + "s ";
  }

  private void showAuthPopup() {
	var authWindow = new Window();
	authWindow.Theme = GD.Load<Theme>("res://assets/theme.tres");
	authWindow.AlwaysOnTop = true;
	authWindow.MaximizeDisabled = true;
	authWindow.Unresizable = true;
	authWindow.InitialPosition = Window.WindowInitialPosition.CenterMainWindowScreen;
	authWindow.Size = new Vector2I(256, 128);
	authWindow.CloseRequested += () =>
	{
	  GetTree().Root.CallDeferred(Node.MethodName.RemoveChild, authWindow);
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

	passwordBox.GuiInput += e =>
	{
	  if (passwordBox.HasFocus() && e is InputEventKey inputEventKey && inputEventKey.IsPressed()) {
		if (inputEventKey.KeyLabel == Key.Enter) {
		  Connection.Instance.AdminAuth(passwordBox.Text);
		  GetTree().Root.CallDeferred(Node.MethodName.RemoveChild, authWindow);
		  GetViewport().SetInputAsHandled();
		}

		if (inputEventKey.KeyLabel == Key.Space) {
		  GetViewport().SetInputAsHandled();
		}
	  }
	};

	var button = new Button();
	button.Text = "Login";
	button.Pressed += () =>
	{
	  Connection.Instance.AdminAuth(passwordBox.Text);
	  GetTree().Root.CallDeferred(Node.MethodName.RemoveChild, authWindow);
	};

	vbox.AddChild(passwordBox);
	vbox.AddChild(button);

	authWindow.AddChild(vbox);

	GetTree().Root.AddChild(authWindow);
  }
}
