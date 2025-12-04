using Godot;
using System;

public partial class BoardScreen : Node2D {
	
	[Export] public PackedScene BracketScene;
	
	private const string RED_CHIP_PATH = "res://scenes/red_chip.tscn";
	private const string YELLOW_CHIP_PATH = "res://scenes/yellow_chip.tscn";
	private const int CHIP_SCALE = 3;
	private const int CHIP_SIZE = 24;
	private const int CHIP_PADDING = 2;
	private const int CHIP_X_OFF = -(CHIP_SIZE + CHIP_PADDING) * 7 / 2 + (CHIP_SIZE + CHIP_PADDING) / 2;
	private const int Y_OFF = 300;
	private const int CARD_CENTER_X_DEFAULT = -536;

	private PackedScene redChip;
	private PackedScene ylwChip;

	private Node2D player1Card; 
	private Node2D player2Card;
	private MatchData matchData;

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
	}

	public override void _ExitTree()
	{
		Connection.Instance.OnObserveWin -= ObserveWin;
		Connection.Instance.OnObserveDraw -= ObserveDraw;
		Connection.Instance.OnObserveTerminated -= ObserveTerminated;
		Connection.Instance.OnObserveMove -= ObserveMove;
	}

	private void ObserveMove(string username, int column)
	{
		if (username == matchData.player1)
		{
			spawnRed(column);
		}
		else
		{
			spawnYellow(column);
		}
	}

	private void ObserveWin(string winner)
	{
		// TODO
		TransitionToBracket();
	}
	
	private void ObserveDraw()
	{
		// TODO
		TransitionToBracket();
	}
	
	private void ObserveTerminated()
	{
		// TODO
		TransitionToBracket();
	}
	
	private void TransitionToBracket()
	{
		GetTree().ChangeSceneToPacked(BracketScene);
	}

	// Called every frame. 'delta' is the elapsed time since the previous frame.
	public override void _Process(double delta) {
		/*
		if(p1 != null) {
            Label username = player1Card.GetNode<Label>("Name");
			username.Text = p1.username;
		
			if(p1.isReady) {
				Label status = player1Card.GetNode<Label>("Status");
				status.Text = "Ready!";
				status.AddThemeColorOverride("font_color", Colors.LimeGreen);
			}
        }
		
		if(p2 != null) {
            Label username = player2Card.GetNode<Label>("Name");
			username.Text = p2.username;
  
			if(p2.isReady) {
				Label status = player2Card.GetNode<Label>("Status");
				status.Text = "Ready!";
				status.AddThemeColorOverride("font_color", Colors.LimeGreen);
			}
        }
        */
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