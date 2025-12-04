using Godot;
using System;
using System.Collections.Generic;

public partial class BracketScene : Control
{
	[Export] public Tree Players;
	[Export] public Tree Matches;
	[Export] public Texture2D JoinButton;
	[Export] public PackedScene BoardScene;
	
	private List<PlayerData> _playerList;
	private List<MatchData> _matchList;
	
	public override void _Ready()
	{
		Players.SetColumnTitle(0, "Name");
		Players.SetColumnTitle(1, "Ready");
		Players.SetColumnTitle(2, "Playing");
		Players.HideRoot = true;
		Players.ButtonClicked += KickPlayer;
		
		
		Matches.SetColumnTitle(0, "Match");
		Matches.SetColumnTitle(1, "Red");
		Matches.SetColumnTitle(2, "Yellow");
		Matches.HideRoot = true;
		Matches.ButtonClicked += WatchGame;
		
		Connection.Instance.OnUpdatedPlayers += UpdatePlayers;
		Connection.Instance.OnUpdatedMatches += UpdateMatches;
		Connection.Instance.OnWatchGameAck += TransitionToBoard;
	}

	public override void _ExitTree()
	{
		Connection.Instance.OnUpdatedPlayers -= UpdatePlayers;
		Connection.Instance.OnUpdatedMatches -= UpdateMatches;
		Connection.Instance.OnWatchGameAck -= TransitionToBoard;
	}

	private void UpdatePlayers(List<PlayerData> playerList)
	{
		Players.Clear();
		_playerList = playerList;
		var root = Players.CreateItem();
		for (int i = 0; i < _playerList.Count; i++)
		{
			var item = Players.CreateItem(root);
			item.SetText(0, playerList[i].username);
			item.SetText(1, playerList[i].isReady ? "Yes" : "No");
			item.SetText(2, playerList[i].isPlaying ? "Yes" : "No");
			if (Connection.Instance.IsAdmin)
			{
				item.AddButton(0, JoinButton, i, false, "Kick"); // TODO
			}
		}
	}
	
	private void UpdateMatches(List<MatchData> matchList)
	{
		Matches.Clear();
		_matchList = matchList;
		var root = Matches.CreateItem();
		for (int i = 0; i < matchList.Count; i++)
		{
			var item = Matches.CreateItem(root);
			item.SetText(0, matchList[i].matchId.ToString());
			item.SetText(1, matchList[i].player1);
			item.SetText(2, matchList[i].player2);
			item.AddButton(0, JoinButton, i, false, "Watch");
		}
	}

	private void WatchGame(TreeItem item, long column, long id, long mouseButtonIndex)
	{
		if (mouseButtonIndex == 1 && column == 0)
		{
			Connection.Instance.SendWatchGame(_matchList[(int) id].matchId);
		} 
	}
	
	private void KickPlayer(TreeItem item, long column, long id, long mouseButtonIndex)
	{
		if (mouseButtonIndex == 1 && column == 0)
		{
			Connection.Instance.KickPlayer(_playerList[(int) id].username);
		} 
	}

	private void TransitionToBoard()
	{
		GetTree().ChangeSceneToPacked(BoardScene);
	}
}
