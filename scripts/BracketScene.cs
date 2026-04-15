using Godot;
using System.Collections.Generic;

public partial class BracketScene : Control {
  [Export] public Tree Players;
  [Export] public Tree Matches;
  [Export] public Texture2D WatchButton;
  [Export] public Texture2D TerminateKickButton;
  private const string BOARD_SCENE_PATH = "res://scenes/game.tscn";

  private List<PlayerData> playerList;
  private List<MatchData> matchList;

  public override void _Ready() {
	Players.SetColumnTitle(0, "Name");
	Players.SetColumnTitle(1, "Ready");
	Players.SetColumnTitle(2, "Playing");
	Players.HideRoot = true;
	Players.ButtonClicked += kickPlayer;


	Matches.SetColumnTitle(0, "Match");
	Matches.SetColumnTitle(1, "Red");
	Matches.SetColumnTitle(2, "Yellow");
	Matches.HideRoot = true;
	Matches.ButtonClicked += watchGame;
	Matches.ButtonClicked += terminateGame;

	Connection.Instance.OnUpdatedPlayers += updatePlayers;
	Connection.Instance.OnUpdatedMatches += updateMatches;
	Connection.Instance.OnWatchGameAck += transitionToBoard;
  }

  public override void _ExitTree() {
	Connection.Instance.OnUpdatedPlayers -= updatePlayers;
	Connection.Instance.OnUpdatedMatches -= updateMatches;
	Connection.Instance.OnWatchGameAck -= transitionToBoard;
  }

  private void updatePlayers(List<PlayerData> newPlayerList) {
	Players.Clear();
	playerList = newPlayerList;
	playerList.Sort((a, b) => a.Username.CompareTo(b.Username));
	var root = Players.CreateItem();
	for (int i = 0; i < playerList.Count; i++) {
	  var item = Players.CreateItem(root);
	  item.SetText(0, newPlayerList[i].Username);
	  item.SetText(1, newPlayerList[i].IsReady ? "Yes" : "No");
	  item.SetText(2, newPlayerList[i].IsPlaying ? "Yes" : "No");
	  if (Connection.Instance.IsAdmin) {
		item.AddButton(0, TerminateKickButton, i, false, "Kick");
	  }
	}
  }

  private void updateMatches(List<MatchData> newMatchList) {
	Matches.Clear();
	matchList = newMatchList;
	var root = Matches.CreateItem();
	for (int i = 0; i < newMatchList.Count; i++) {
	  var item = Matches.CreateItem(root);
	  item.SetText(0, newMatchList[i].matchId.ToString());
	  item.SetText(1, newMatchList[i].player1);
	  item.SetText(2, newMatchList[i].player2);
	  item.AddButton(0, WatchButton, i, false, "Watch");
	  if (Connection.Instance.IsAdmin) {
		item.AddButton(0, TerminateKickButton, 128 + i, false, "Terminate");
	  }
	}
  }

  private void watchGame(TreeItem item, long column, long id, long mouseButtonIndex) {
	if (mouseButtonIndex == 1 && column == 0 && id < 128) {
	  Connection.Instance.SendWatchGame(matchList[(int)id].matchId);
	}
  }

  private void terminateGame(TreeItem item, long column, long id, long mouseButtonIndex) {
	if (mouseButtonIndex == 1 && column == 0 && id - 128 >= 0 && matchList[(int)id - 128] != null) {
	  Connection.Instance.TerminateGame(matchList[(int)id - 128].matchId);
	}
  }

  private void kickPlayer(TreeItem item, long column, long id, long mouseButtonIndex) {
	if (mouseButtonIndex == 1 && column == 0) {
	  Connection.Instance.KickPlayer(playerList[(int)id].Username);
	}
  }

  private void transitionToBoard() { GetTree().ChangeSceneToFile(BOARD_SCENE_PATH); }
}
