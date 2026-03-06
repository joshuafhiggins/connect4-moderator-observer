using Godot;
using System;
using System.Collections.Generic;

public partial class Connection : Node {
  public const string WS_DEFAULT_ADDRESS = "wss://connect4.abunchofknowitalls.com";

  private static TournamentType? parseTournamentType(string type) {
    switch (type) {
      case "RoundRobin":
        return TournamentType.RoundRobin;
      case "false":
        return TournamentType.None;
      default:
        return null;
    }
  }

  public static Connection Instance { get; private set; }

  private WebSocketPeer webSocket = new WebSocketPeer();
  public event Action OnConnected;
  public event Action OnReadyAcknowledged;
  public event Action<bool> OnGameStart;
  public event Action OnGameWin;
  public event Action OnGameLoss;
  public event Action OnGameDraw;
  public event Action OnGameTerminated;
  public event Action<int> OnOpponentMove;

  public event Action OnWatchGameAck;
  public event Action<string> OnObserveWin;
  public event Action OnObserveDraw;
  public event Action OnObserveTerminated;
  public event Action<string, int> OnObserveMove;
  public event Action<List<MatchData>> OnUpdatedMatches;
  public event Action<List<PlayerData>> OnUpdatedPlayers;
  public event Action OnStartTournament;
  public event Action OnTournamentEnd;
  public event Action OnCancelTournamentAck;
  public event Action OnBecomeAdmin;
  public event Action OnGetDataAcks;
  public event Action OnSetDataAcks;

  public event Action<List<(string player1, string player2)>> OnUpdatedReservations;

  public event Action OnWsConnectionSuccess;
  public event Action OnWsConnectionFailed;
  public event Action OnWsDisconnect;

  // Already prints to console
  public event Action<string> OnError;

  public bool IsAdmin { get; private set; }
  public bool IsPlayer { get; private set; }
  public TournamentType ActiveTournament { get; private set; }
  public bool DemoMode { get; private set; }

  public List<(string player1, string player2)> Reservations { get; private set; } = [];

  public List<(string, int)> PreviousMoves { get; private set; } = [];
  public double CurrentWaitTimeout { get; private set; } = 5.0;
  public double MaxTimeout { get; private set; } = 30.0;
  public MatchData CurrentObservingMatch { get; private set; }
  public string LastUsedConnectionAddress { get; private set; } = "";
  public string LastError { get; private set; } = "";

  private bool IsSocketOpen => webSocket.GetReadyState() == WebSocketPeer.State.Open;

  private bool isConnecting = false;
  private bool isConnected = false;
  private List<(string, int)> lastScoreboard = [];
  private bool shouldShowTournamentResults = false;
  private float refreshGamePlayerListTimer = 5.0f;

  public override void _Ready() {
    Instance = this;
    webSocket.SetHeartbeatInterval(5.0);
    webSocket.HeartbeatInterval = 5.0;
    Instance.OnWsDisconnect += () => GetTree().ChangeSceneToFile("res://scenes/main_menu.tscn");
  }

  public void Connect(string address) {
    isConnecting = true;
    LastUsedConnectionAddress = address;
    if (isConnected) {
      return;
    }

    Error error = webSocket.ConnectToUrl(address);
    if (error != Error.Ok) {
      LastError = error.ToString();
    }
  }

  public override void _Process(double delta) {
    webSocket.Poll();
    WebSocketPeer.State state = webSocket.GetReadyState();
    if (state == WebSocketPeer.State.Open) {
      if (isConnecting) {
        isConnecting = false;
        isConnected = true;
        LastError = "";
        OnWsConnectionSuccess?.Invoke();
        UpdateGameList();
        UpdatePlayerList();
        GetReservations();
        refreshGamePlayerListTimer = 5.0f;
      } else if (refreshGamePlayerListTimer <= 0.0f) {
        UpdateGameList();
        UpdatePlayerList();
        GetReservations();
        refreshGamePlayerListTimer = 5.0f;
      } else {
        refreshGamePlayerListTimer -= (float)delta;
      }

      while (webSocket.GetAvailablePacketCount() > 0) {
        string message = webSocket.GetPacket().GetStringFromUtf8();
        handleServerMessage(message);
      }

      if (shouldShowTournamentResults) {
        var children = GetTree().Root.GetChildren();
        foreach (var child in children) {
          if (child.Name.ToString() == "BracketView") {
            shouldShowTournamentResults = false;
            ShowTournamentScoreboard(lastScoreboard);
          }
        }
      }
    } else if (state == WebSocketPeer.State.Connecting) {
      // Do nothing
    } else if (state == WebSocketPeer.State.Closing) {
      // Do nothing
    } else if (state == WebSocketPeer.State.Closed) {
      if (isConnecting) {
        isConnecting = false;
        OnWsConnectionFailed?.Invoke();
      } else if (isConnected) {
        isConnected = false;
        IsAdmin = false;
        CurrentWaitTimeout = 5.0;
        ActiveTournament = TournamentType.None;
        DemoMode = false;
        refreshGamePlayerListTimer = 5.0f;
        var code = webSocket.GetCloseCode();
        var reason = webSocket.GetCloseReason();
        LastError = "Unexpected Disconnect. Reason: " + reason + ", Code: " + code;
        GD.PrintErr("WebSocket closed with code: " + code + ", reason " + reason + ". Clean: " + (code != -1));
        OnWsDisconnect?.Invoke();
      }
    }
  }

  // Player commands
  public void SendConnect(string clientId) {
    if (string.IsNullOrWhiteSpace(clientId)) {
      GD.PrintErr("Client ID is required to CONNECT.");
      return;
    }

    clientId = clientId.Trim();

    if (clientId.Contains(":")) {
      GD.PrintErr("Client ID cannot contain ':' characters.");
      return;
    }

    sendCommand("CONNECT", clientId);
  }

  public void SendDisconnect() { sendCommand("DISCONNECT"); }
  public void SendReady() { sendCommand("READY"); }
  public void SendPlay(int column) { sendCommand("PLAY", column.ToString()); }

  // Observer commands
  public void UpdateGameList() { sendCommand("GAME", "LIST"); }
  public void UpdatePlayerList() { sendCommand("PLAYER", "LIST"); }
  public void SendWatchGame(int matchID) { sendCommand("GAME", "WATCH:" + matchID); }
  public void AdminAuth(string password) {
    if (IsAdmin) return;
    sendCommand("ADMIN", "AUTH:" + password);
  }
  public void GetMoveWait() { sendCommand("GET", "MOVE_WAIT"); }
  public void GetTournamentStatus() { sendCommand("GET", "TOURNAMENT_STATUS"); }
  public void GetDemoMode() { sendCommand("GET", "DEMO_MODE"); }
  public void GetMaxTimeout() { sendCommand("GET", "MAX_TIMEOUT"); }

  // Admin commands
  public void KickPlayer(string playerId) {
    if (!IsAdmin) return;
    sendCommand("ADMIN", "KICK:" + playerId);
  }

  public void StartTournament(string tournamentType = "RoundRobin") {
    if (!IsAdmin) return;
    sendCommand("TOURNAMENT", "START:" + tournamentType);
  }

  public void CancelTournament() {
    if (!IsAdmin) return;
    sendCommand("TOURNAMENT", "CANCEL");
  }

  public void TerminateGame(int matchID) {
    if (!IsAdmin) return;
    sendCommand("GAME", "TERMINATE:" + matchID);
  }

  public void AwardGameWinner(int matchID, string winnerUsername) {
    if (!IsAdmin) return;
    if (string.IsNullOrWhiteSpace(winnerUsername)) return;
    sendCommand("GAME", "AWARD:" + matchID + ":" + winnerUsername.Trim());
  }

  public void SetMoveWait(float waitTime) {
    if (!IsAdmin) return;
    CurrentWaitTimeout = waitTime;
    sendCommand("SET", "MOVE_WAIT:" + waitTime);
  }

  public void SetDemoMode(bool demoMode) {
    if (!IsAdmin) return;
    DemoMode = demoMode;
    sendCommand("SET", "DEMO_MODE:" + demoMode);
  }

  public void SetMaxTimeout(float maxTimeout) {
    if (!IsAdmin) return;
    MaxTimeout = maxTimeout;
    sendCommand("SET", "MAX_TIMEOUT:" + maxTimeout);
  }

  public void AddReservation(string player1Username, string player2Username) {
    if (!IsAdmin) return;
    sendCommand("RESERVATION", $"ADD:{player1Username},{player2Username}");
  }

  public void DeleteReservation(string player1Username, string player2Username) {
    if (!IsAdmin) return;
    sendCommand("RESERVATION", $"DELETE:{player1Username},{player2Username}");
  }

  public void GetReservations() {
    if (!IsAdmin) return;
    sendCommand("RESERVATION", "GET");
  }

  private void sendCommand(string header, string body = "") {
    if (!IsSocketOpen) {
      GD.PrintErr($"Cannot send {header}, socket is not open.");
      return;
    }

    string payload = string.IsNullOrEmpty(body) ? header : $"{header}:{body}";
    webSocket.SendText(payload);
  }

  private void handleServerMessage(string message) {
    if (string.IsNullOrWhiteSpace(message)) {
      return;
    }

    message = message.Trim();

    string header;
    string body;
    int separatorIndex = message.IndexOf(':');
    if (separatorIndex >= 0) {
      header = message.Substring(0, separatorIndex).Trim();
      body = message.Substring(separatorIndex + 1).Trim();
    } else {
      header = message.Trim();
      body = string.Empty;
    }

    header = header.ToUpperInvariant();

    switch (header) {
      case "CONNECT":
        if (body.Equals("ACK", StringComparison.OrdinalIgnoreCase)) {
          IsPlayer = true;
          OnConnected?.Invoke();
        }

        break;
      case "READY":
        if (body.Equals("ACK", StringComparison.OrdinalIgnoreCase)) {
          OnReadyAcknowledged?.Invoke();
        }

        break;
      case "GAME":
        handleGameMessage(body);
        break;
      case "PLAYER":
        handlePlayerList(body);
        break;
      case "OPPONENT":
        if (int.TryParse(body, out int column)) {
          OnOpponentMove?.Invoke(column);
        } else {
          GD.PrintErr($"Invalid opponent column: {body}");
        }

        break;
      case "ADMIN":
        if (body == "AUTH:ACK") {
          IsAdmin = true;
          GetMoveWait();
          GetTournamentStatus();
          GetReservations();
          OnBecomeAdmin?.Invoke();
        }

        break;
      case "TOURNAMENT":
        handleTournamentMessage(body);
        break;
      case "RESERVATION":
        handleReservationMessage(body);
        break;
      case "GET":
        string data = body.Split(":")[1];
        if (body.StartsWith("MOVE_WAIT")) {
          CurrentWaitTimeout = double.Parse(data);
        } else if (body.StartsWith("MAX_TIMEOUT")) {
          MaxTimeout = double.Parse(data);
        } else if (body.StartsWith("DEMO_MODE")) {
          DemoMode = bool.Parse(data);
        } else if (body.StartsWith("TOURNAMENT_STATUS")) {
          TournamentType? type = parseTournamentType(data);

          if (type == null) {
            GD.PrintErr($"Unhandled tournament type: {data}");
          } else {
            ActiveTournament = type.Value;
          }
        } else {
          GD.PrintErr($"Unhandled data get: {body}");
        }

        OnGetDataAcks?.Invoke();
        break;
      case "SET":
        OnSetDataAcks?.Invoke();
        break;
      case "ERROR":
        GD.PrintErr(message);
        OnError?.Invoke(message);
        break;
      default:
        GD.Print($"Unhandled server message: {message}");
        break;
    }
  }

  private void handleTournamentMessage(string body) {
    if (string.IsNullOrWhiteSpace(body)) {
      return;
    }

    string[] segments = body.Split(':');
    string command = segments[0].Trim().ToUpperInvariant();
    string argument = segments.Length > 1 ? segments[1].Trim() : string.Empty;

    switch (command) {
      case "END": {
        ActiveTournament = TournamentType.None;
        List<(string, int)> playerScoreboard = new List<(string, int)>();
        string[] entries = segments[1].Split("|");
        foreach (string entry in entries) {
          string[] data = entry.Split(',');
          playerScoreboard.Add((data[0], int.Parse(data[1])));
        }

        lastScoreboard = playerScoreboard;
        shouldShowTournamentResults = true;
        OnTournamentEnd?.Invoke();
        break;
      }
      case "START": {
        TournamentType? type = parseTournamentType(argument);
        if (type == null) {
          GD.PrintErr($"Unhandled tournament type: {argument}");
        } else {
          ActiveTournament = type.Value;
          OnStartTournament?.Invoke();
        }

        break;
      }
      case "CANCEL": {
        ActiveTournament = TournamentType.None;
        OnCancelTournamentAck?.Invoke();
        break;
      }
    }
  }

  private void handleReservationMessage(string body) {
    if (string.IsNullOrWhiteSpace(body)) {
      return;
    }

    string[] segments = body.Split(':');
    string command = segments[0].Trim().ToUpperInvariant();

    switch (command) {
      case "ADD": {
        if (segments.Length < 2) break;
        string[] users = segments[1].Split(',');
        if (users.Length != 2) break;

        var p1 = users[0];
        var p2 = users[1];
        Reservations.Add((p1, p2));
        OnUpdatedReservations?.Invoke(new List<(string player1, string player2)>(Reservations));
        break;
      }
      case "DELETE": {
        if (segments.Length < 2) break;
        string[] users = segments[1].Split(',');
        if (users.Length != 2) break;

        var p1 = users[0];
        var p2 = users[1];
        Reservations.RemoveAll(r => r.player1 == p1 && r.player2 == p2);
        OnUpdatedReservations?.Invoke(new List<(string player1, string player2)>(Reservations));
        break;
      }
      case "LIST": {
        var reservations = new List<(string player1, string player2)>();

        if (segments.Length >= 2 && !string.IsNullOrWhiteSpace(segments[1])) {
          string[] entries = segments[1].Split('|');
          foreach (string entry in entries) {
            string[] users = entry.Split(',');
            if (users.Length != 2) continue;
            reservations.Add((users[0], users[1]));
          }
        }

        Reservations = reservations;
        OnUpdatedReservations?.Invoke(new List<(string player1, string player2)>(Reservations));
        break;
      }
      default:
        GD.PrintErr($"Unhandled RESERVATION message: {body}");
        break;
    }
  }

  private void handlePlayerList(string body) {
    if (string.IsNullOrWhiteSpace(body)) {
      return;
    }

    string[] segments = body.Split(':');
    string command = segments[0].Trim().ToUpperInvariant();

    switch (command) {
      case "LIST": {
        List<PlayerData> players = new List<PlayerData>();

        if (segments.Length < 2) {
          OnUpdatedPlayers?.Invoke(players);
          break;
        }

        string[] entries = segments[1].Split("|");
        foreach (string entry in entries) {
          string[] data = entry.Split(',');
          players.Add(new PlayerData(data[0], bool.Parse(data[1]), bool.Parse(data[2])));
        }

        OnUpdatedPlayers?.Invoke(players);
        break;
      }
    }
  }

  private void handleGameMessage(string body) {
    if (string.IsNullOrWhiteSpace(body)) {
      return;
    }

    string[] segments = body.Split(':');
    string command = segments[0].Trim().ToUpperInvariant();
    string argument = segments.Length > 1 ? segments[1].Trim() : string.Empty;

    if (IsPlayer) {
      switch (command) {
        case "START":
          bool isFirst = argument == "1" || argument.Equals("TRUE", StringComparison.OrdinalIgnoreCase);
          OnGameStart?.Invoke(isFirst);
          break;
        case "WINS":
          OnGameWin?.Invoke();
          break;
        case "LOSS":
          OnGameLoss?.Invoke();
          break;
        case "DRAW":
          OnGameDraw?.Invoke();
          break;
        case "TERMINATED":
          OnGameTerminated?.Invoke();
          break;
        default:
          GD.Print($"Unhandled GAME message: {body}");
          break;
      }
    } else // Regular observer/admin
    {
      switch (command) {
        case "WIN":
          OnObserveWin?.Invoke(segments[1]);
          break;
        case "MOVE":
          OnObserveMove?.Invoke(segments[1], int.Parse(segments[2]));
          break;
        case "DRAW":
          OnObserveDraw?.Invoke();
          break;
        case "TERMINATED":
          OnObserveTerminated?.Invoke();
          break;
        case "LIST":
          List<MatchData> matches = new List<MatchData>();

          if (segments.Length < 2) {
            OnUpdatedMatches?.Invoke(matches);
            break;
          }

          string[] entries = segments[1].Split("|");
          foreach (string entry in entries) {
            string[] data = entry.Split(',');
            matches.Add(new MatchData(int.Parse(data[0]), data[1], data[2]));
          }

          OnUpdatedMatches?.Invoke(matches);
          break;
        case "WATCH":
          CurrentObservingMatch = null;
          PreviousMoves.Clear();
          string[] activeMatchData = segments[2].Split("|");
          if (activeMatchData.IsEmpty()) {
            string[] matchData = segments[2].Split(',');
            CurrentObservingMatch = new MatchData(int.Parse(matchData[0]), matchData[1], matchData[2]);
          } else {
            string[] matchData = activeMatchData[0].Split(',');
            CurrentObservingMatch = new MatchData(int.Parse(matchData[0]), matchData[1], matchData[2]);
            for (int i = 1; i < activeMatchData.Length; i++) {
              string[] moveData = activeMatchData[i].Split(',');
              PreviousMoves.Add((moveData[0], int.Parse(moveData[1])));
            }
          }

          OnWatchGameAck?.Invoke();
          break;
        default:
          GD.Print($"Unhandled GAME message: {body}");
          break;
      }
    }
  }

  public void ShowTournamentScoreboard(List<(string, int)> playerScoreboard) {
    var scoreboardWindow = new Window();
    scoreboardWindow.Theme = GD.Load<Theme>("res://assets/theme.tres");
    scoreboardWindow.AlwaysOnTop = true;
    scoreboardWindow.MaximizeDisabled = true;
    scoreboardWindow.Unresizable = true;
    scoreboardWindow.InitialPosition = Window.WindowInitialPosition.CenterMainWindowScreen;
    scoreboardWindow.Size = new Vector2I(256, 512);
    scoreboardWindow.CloseRequested += () => { GetTree().Root.RemoveChild(scoreboardWindow); };

    var tree = new Tree();
    tree.HideRoot = true;
    tree.Columns = 2;
    tree.ColumnTitlesVisible = true;
    tree.Theme = GD.Load<Theme>("res://assets/theme.tres");
    tree.GrowHorizontal = Control.GrowDirection.Both;
    tree.GrowVertical = Control.GrowDirection.Both;
    tree.SetColumnTitle(0, "Player");
    tree.SetColumnTitle(1, "Score");
    var root = tree.CreateItem();

    foreach ((string, int) entry in playerScoreboard) {
      var item = tree.CreateItem(root);
      item.SetText(0, entry.Item1);
      item.SetText(1, entry.Item2.ToString());
    }

    scoreboardWindow.AddChild(tree);
    tree.SetAnchorsPreset(Control.LayoutPreset.FullRect);

    GetTree().Root.AddChild(scoreboardWindow);
  }
}
