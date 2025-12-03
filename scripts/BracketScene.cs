using Godot;
using System;
using System.Collections.Generic;

public partial class BracketScene : Control
{
	[Export] public Tree players;
	
	public override void _Ready()
	{
		players.SetColumnTitle(0, "Name");
		players.SetColumnTitle(1, "Ready");
		players.SetColumnTitle(2, "Playing");
		
		Connection.Instance.OnUpdatedPlayers += UpdatePlayers;
		Connection.Instance.OnBecomeAdmin += BecomeAdmin;
		Connection.Instance.OnWatchGameAck += TransitionToBoard;
	}

	public override void _ExitTree()
	{
		Connection.Instance.OnUpdatedPlayers -= UpdatePlayers;
	}

	private void UpdatePlayers(List<PlayerData> playerList)
	{
		players.Clear();
		foreach (var playerData in playerList)
		{
			var item = players.CreateItem();
			item.SetText(0, playerData.username);
			item.SetText(1, playerData.isReady ? "Yes" : "No");
			item.SetText(2, playerData.isPlaying ? "Yes" : "No");
		}
	}

	private void BecomeAdmin()
	{
		// TODO
	}

	private void TransitionToBoard()
	{
		// TODO
	}
}
