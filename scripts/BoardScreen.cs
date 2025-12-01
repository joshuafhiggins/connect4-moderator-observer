using Godot;
using System;
using System.Collections;
using System.Collections.Generic;

public partial class BoardScreen : Node2D {
	private const string RED_CHIP_PATH = "res://scenes/red_chip.tscn";
	private const string YELLOW_CHIP_PATH = "res://scenes/yellow_chip.tscn";
	private const int CHIP_SIZE = 24;
	private const int CHIP_PADDING = 2;
	private const int INIT_OFFSET = -(CHIP_SIZE + CHIP_PADDING) * 7 / 2;

	private TextureButton spwnRed;
	private TextureButton spwnYlw;
	private PackedScene redChip;
	private PackedScene ylwChip;

	private RigidBody2D[,] chips = new RigidBody2D[6, 7]; // 6 rows 7 cols | 0, 0 is top left

	// Called when the node enters the scene tree for the first time.
	public override void _Ready() {
        spwnRed = GetNode<TextureButton>("SpwnRed");
		spwnYlw = GetNode<TextureButton>("SpwnYlw");

		spwnRed.GetNode<Label>("Label").Text = "Red";
		spwnYlw.GetNode<Label>("Label").Text = "Ylw";

		spwnRed.Pressed += () => spawnRed(0);
		spwnYlw.Pressed += () => spawnYellow(0);

		redChip = GD.Load<PackedScene>(RED_CHIP_PATH);
		ylwChip = GD.Load<PackedScene>(YELLOW_CHIP_PATH);
    }

	// Called every frame. 'delta' is the elapsed time since the previous frame.
	public override void _Process(double delta) {
        
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

        GD.Print("Spawn Red!");
		RigidBody2D newNode = redChip.Instantiate<RigidBody2D>();
		newNode.Position = new Vector2(INIT_OFFSET + (CHIP_SIZE + CHIP_PADDING) * col, -(CHIP_SIZE + CHIP_PADDING) * 7);
		AddChild(newNode);

		chips[row, col] = newNode;
    }

	private void spawnYellow(int col) {
		int row = canPlaceOnCol(col);
		if(row == -1) {
			GD.Print("Invalid Placement!");
			return;
		}

		GD.Print("Spawn Yellow!");
		RigidBody2D newNode = ylwChip.Instantiate<RigidBody2D>();
		newNode.Position = new Vector2(INIT_OFFSET + (CHIP_SIZE + CHIP_PADDING) * col, -(CHIP_SIZE + CHIP_PADDING) * 7);
		AddChild(newNode);

		chips[row, col] = newNode;
	}
}
