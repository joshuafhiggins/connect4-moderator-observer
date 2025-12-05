using Godot;
using System;
using System.Collections.Generic;

public partial class BoardScreen : Node2D {
	
	private const string RED_CHIP_PATH = "res://scenes/red_chip.tscn";
	private const string YELLOW_CHIP_PATH = "res://scenes/yellow_chip.tscn";
	private const string BRACKET_SCENE_PATH = "res://scenes/bracket_view.tscn";
	private const int CHIP_SCALE = 3;
	private const int CHIP_SIZE = 24;
	private const int CHIP_PADDING = 2;
	private const int CHIP_X_OFF = -(CHIP_SIZE + CHIP_PADDING) * 7 / 2 + (CHIP_SIZE + CHIP_PADDING) / 2;
	private const int Y_OFF = 300;
	private const int CARD_CENTER_X_DEFAULT = -536;
	private const double MOVE_TIMEOUT_BEFORE_PLACE = 1.0f;

	private double currentTimeout = 0.0f;

	private PackedScene redChip;
	private PackedScene ylwChip;

	private Node2D player1Card; 
	private Node2D player2Card;
	private MatchData matchData;

	private List<(string, int)> moves;

	private RigidBody2D[,] chips = new RigidBody2D[6, 7]; // 6 rows 7 cols | 0, 0 is top left

	// Called when the node enters the scene tree for the first time.
	public override void _Ready() {
		// Node initialization
		player1Card = GetNode<Node2D>("Player1Card");
		player2Card = GetNode<Node2D>("Player2Card");

		player1Card.GetNode<Label>("Name").Resized += () => setPlayerCardScale((player1Card.GetNode<Label>("Name").GetRect().Size.X + 7) / 16, player1Card);
		player2Card.GetNode<Label>("Name").Resized += () => setPlayerCardScale((player2Card.GetNode<Label>("Name").GetRect().Size.X + 7) / 16, player2Card);

		redChip = GD.Load<PackedScene>(RED_CHIP_PATH);
		ylwChip = GD.Load<PackedScene>(YELLOW_CHIP_PATH);
		
		matchData = Connection.Instance.CurrentObservingMatch;
		player1Card.GetNode<Label>("Name").Text = matchData.player1;
		player2Card.GetNode<Label>("Name").Text = matchData.player2;
		
		Connection.Instance.OnObserveWin += ObserveWin;
		Connection.Instance.OnObserveDraw += ObserveDraw;
		Connection.Instance.OnObserveTerminated += ObserveTerminated;
		Connection.Instance.OnObserveMove += ObserveMove;
		Connection.Instance.OnTournamentEnd += ShowTournamentScoreboard;
	}

	public override void _Process(double delta)
	{
		if (Connection.Instance.PreviousMoves.Count != 0 && currentTimeout <= 0.0f)
		{
			var move = Connection.Instance.PreviousMoves[0];
			Connection.Instance.PreviousMoves.RemoveAt(0);
			if (move.Item1 == matchData.player1)
			{
				spawnRed(move.Item2);
			}
			else
			{
				spawnYellow(move.Item2);
			}

			currentTimeout = MOVE_TIMEOUT_BEFORE_PLACE;
		} 
		else if (currentTimeout >= 0.0f)
		{
			currentTimeout -= delta;
		}
	}

	public override void _ExitTree()
	{
		Connection.Instance.OnObserveWin -= ObserveWin;
		Connection.Instance.OnObserveDraw -= ObserveDraw;
		Connection.Instance.OnObserveTerminated -= ObserveTerminated;
		Connection.Instance.OnObserveMove -= ObserveMove;
		Connection.Instance.OnTournamentEnd -= ShowTournamentScoreboard;
	}

	private void ObserveMove(string username, int column)
	{
		Connection.Instance.PreviousMoves.Add((username, column));
	}

	private void ObserveWin(string winner)
	{
		PopupMessage(winner + " wins!");
	}
	
	private void ObserveDraw()
	{
		PopupMessage("Draw!");
	}
	
	private void ObserveTerminated()
	{
		PopupMessage("Match Terminated");
	}

	private void PopupMessage(string message)
	{
		var popup = new Popup();
		popup.AlwaysOnTop = true;
		popup.PopupCentered();
		popup.Size = new Vector2I(200, 100);
		var text = new Label();
		text.Text = message;
		popup.AddChild(text);
		text.GrowHorizontal = Control.GrowDirection.Both;
		text.GrowVertical = Control.GrowDirection.Both;
		text.HorizontalAlignment = HorizontalAlignment.Center;
		text.VerticalAlignment = VerticalAlignment.Center;
		text.AnchorsPreset = (int) Control.LayoutPreset.FullRect;
		popup.InitialPosition = Window.WindowInitialPosition.CenterMainWindowScreen;
		GetTree().Root.AddChild(popup);
		popup.Show();
		TransitionToBracket();
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
	
	private void TransitionToBracket()
	{
		GetTree().ChangeSceneToFile(BRACKET_SCENE_PATH);
	}

	/*
	 * Determines if the column can have a new chip placed
	 * Will return -1 if invalid
	 * or
	 * Will return row of board in which chip can be placed
	 */
	public int canPlaceOnCol(int col) {
		if(col < 0 || col > 6) // Col out of range
			return -1;

		return getNextAvailRow(col);
	}

	public int getNextAvailRow(int col) {
		for(int i = chips.GetLength(0) - 1; i >= 0; i--) { // Start at bottom
			if(chips[i, col] == null)
				return i;
		}

		return -1;
	}

	private void spawnRed(int col) {
		int row = canPlaceOnCol(col);
		if(row == -1) {
			GD.Print("Invalid Placement!");
			return;
		}

		RigidBody2D newNode = redChip.Instantiate<RigidBody2D>();
		AddChild(newNode);
		newNode.Position = new Vector2(CHIP_SCALE * (CHIP_X_OFF + (CHIP_SIZE + CHIP_PADDING) * col), -(CHIP_SIZE + CHIP_PADDING) * 7);

		chips[row, col] = newNode;
	}

	private void spawnYellow(int col) {
		int row = canPlaceOnCol(col);
		if(row == -1) {
			GD.Print("Invalid Placement!");
			return;
		}

		RigidBody2D newNode = ylwChip.Instantiate<RigidBody2D>();
		AddChild(newNode);
		newNode.Position = new Vector2(CHIP_SCALE * (CHIP_X_OFF + (CHIP_SIZE + CHIP_PADDING) * col), -(CHIP_SIZE + CHIP_PADDING) * 7); 

		chips[row, col] = newNode;
	}

	private void setPlayerCardScale(float x, Node2D playerCard) {
		Sprite2D cardCenter = playerCard.GetNode<Sprite2D>("Center");
		Sprite2D cardRight = playerCard.GetNode<Sprite2D>("Right");

		float offX = 16 * x / 2;
		cardCenter.Scale = new Vector2(x, 2);
		cardCenter.Position = new Vector2(CARD_CENTER_X_DEFAULT + offX, cardCenter.Position.Y);

		cardRight.Position = new Vector2(CARD_CENTER_X_DEFAULT + offX * 2 + 8, cardRight.Position.Y); // 8 is a magic number (im too lazy) for the size of the card edge multipled by 2
	}
}

enum Direction
{
	UP,
	UP_RIGHT,
	RIGHT,
	DOWN_RIGHT,
	DOWN,
	DOWN_LEFT,
	LEFT,
	UP_LEFT
}
