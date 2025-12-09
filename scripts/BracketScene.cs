using Godot;
using System.Collections.Generic;

public partial class BracketScene : Control
{
	[Export] public Tree Players;
	[Export] public Tree Matches;
	[Export] public Texture2D WatchButton;
	[Export] public Texture2D TerminateKickButton;
	private const string BOARD_SCENE_PATH = "res://scenes/game.tscn";
	
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
		Matches.ButtonClicked += TerminateGame;
		
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
		_playerList.Sort((a, b) => a.username.CompareTo(b.username));
		var root = Players.CreateItem();
		for (int i = 0; i < _playerList.Count; i++)
		{
			var item = Players.CreateItem(root);
			item.SetText(0, playerList[i].username);
			item.SetText(1, playerList[i].isReady ? "Yes" : "No");
			item.SetText(2, playerList[i].isPlaying ? "Yes" : "No");
			if (Connection.Instance.IsAdmin)
			{
				item.AddButton(0, TerminateKickButton, i, false, "Kick");
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
			item.AddButton(0, WatchButton, i, false, "Watch");
			if (Connection.Instance.IsAdmin)
			{
				item.AddButton(0, TerminateKickButton, 128 + i, false, "Terminate");
			}
		}
	}

	private void WatchGame(TreeItem item, long column, long id, long mouseButtonIndex)
	{
		if (mouseButtonIndex == 1 && column == 0 && id < 128)
		{
			Connection.Instance.SendWatchGame(_matchList[(int) id].matchId);
		} 
	}
	
	private void TerminateGame(TreeItem item, long column, long id, long mouseButtonIndex)
	{
		if (mouseButtonIndex == 1 && column == 0 && id - 128 >= 0 && _matchList[(int) id - 128] != null)
		{
			Connection.Instance.TerminateGame(_matchList[(int) id - 128].matchId);
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
		GetTree().ChangeSceneToFile(BOARD_SCENE_PATH);
	}
}
