using Godot;
using System;
using System.Collections.Generic;
using System.Threading;

public partial class Connection : Node
{
	public const string WS_DEFAULT_ADDRESS = "wss://connect4.abunchofknowitalls.com";

	public static Connection Instance { get; private set; }

	private WebSocketPeer _webSocket = new ();
	private Thread _gameListThread;
	private bool _gameListThreadRunning;

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
	public event Action OnStartTournamentAck;
	public event Action OnTournamentEnd;
	public event Action OnCancelTournamentAck;
	public event Action OnBecomeAdmin;
	public event Action OnGetDataAcks;

	public event Action OnWsConnectionSuccess;
	public event Action OnWsConnectionFailed;
	public event Action OnWsDisconnect;

	// Already prints to console
	public event Action<string> OnError;

	public bool IsAdmin { get; private set; }
	public bool IsPlayer { get; private set; }
	public bool ActiveTournament { get; private set; }
	public bool DemoMode { get; private set; }
	public List<(string, int)> PreviousMoves { get; private set; } = [];
	public double CurrentWaitTimeout { get; private set; } = 5.0;
	public MatchData CurrentObservingMatch { get; private set; }
	public string LastUsedConnectionAddress { get; private set; } = "";
	public string LastError { get; private set; } = "";

	private bool IsSocketOpen => _webSocket.GetReadyState() == WebSocketPeer.State.Open;

	private bool _connecting = false;
	private bool _connected = false;
	private List<(string, int)> _lastScoreboard = [];
	private bool _shouldShowTournamentResults = false;

	public override void _Ready()
	{
		Instance = this;
		_webSocket.SetHeartbeatInterval(5.0);
		_webSocket.HeartbeatInterval = 5.0;
		Instance.OnWsDisconnect += () => GetTree().ChangeSceneToFile("res://scenes/main_menu.tscn");
	}

	public void Connect(string address)
	{
		_connecting = true;
		LastUsedConnectionAddress = address;
		if (_connected)
		{
			return;
		}

		Error error = _webSocket.ConnectToUrl(address);
		if (error != Error.Ok)
		{
			LastError = error.ToString();
		}
	}

	public override void _ExitTree()
	{
		StopGameListRefreshLoop();
	}

	public override void _Process(double delta)
	{
		_webSocket.Poll();
		WebSocketPeer.State state = _webSocket.GetReadyState();
		if (state == WebSocketPeer.State.Open)
		{
			if (_connecting)
			{
				_connecting = false;
				_connected = true;
				LastError = "";
				OnWsConnectionSuccess?.Invoke();
				StartGameListRefreshLoop();
			}
			
			while (_webSocket.GetAvailablePacketCount() > 0)
			{
				string message = _webSocket.GetPacket().GetStringFromUtf8();
				HandleServerMessage(message);
			}

			if (_shouldShowTournamentResults)
			{
				var children = GetTree().Root.GetChildren();
				foreach (var child in children)
				{
					if (child.Name.ToString() == "BracketView")
					{
						_shouldShowTournamentResults = false;
						ShowTournamentScoreboard(_lastScoreboard);
					}
				}
			}
		} 
		else if (state == WebSocketPeer.State.Connecting)
		{
			// Do nothing
		}
		else if (state == WebSocketPeer.State.Closing)
		{
			// Do nothing
		}
		else if (state == WebSocketPeer.State.Closed)
		{
			if (_connecting)
			{
				_connecting = false;
				OnWsConnectionFailed?.Invoke();
			}
			else if (_connected)
			{
				_connected = false;
				IsAdmin = false;
				CurrentWaitTimeout = 5.0;
				ActiveTournament = false;
				DemoMode = false;
				StopGameListRefreshLoop();
				var code = _webSocket.GetCloseCode();
				var reason = _webSocket.GetCloseReason();
				LastError = "Unexpected Disconnect. Reason: " + reason +  ", Code: " + code;
				GD.PrintErr("WebSocket closed with code: " + code + ", reason " + reason + ". Clean: " + (code != -1));
				OnWsDisconnect?.Invoke();
			}
		}
	}

	// Player commands
	public void SendConnect(string clientId)
	{
		if (string.IsNullOrWhiteSpace(clientId))
		{
			GD.PrintErr("Client ID is required to CONNECT.");
			return;
		}

		clientId = clientId.Trim();

		if (clientId.Contains(":"))
		{
			GD.PrintErr("Client ID cannot contain ':' characters.");
			return;
		}

		SendCommand("CONNECT", clientId);
	}

	public void SendReady()
	{
		SendCommand("READY");
	}

	public void SendPlay(int column)
	{
		SendCommand("PLAY", column.ToString());
	}

	// Observer commands
	public void UpdateGameList()
	{
		SendCommand("GAME", "LIST");
	}

	private void StartGameListRefreshLoop()
	{
		if (_gameListThreadRunning)
		{
			return;
		}

		_gameListThreadRunning = true;
		_gameListThread = new Thread(() =>
		{
			while (_gameListThreadRunning)
			{
				if (IsSocketOpen)
				{
					UpdateGameList();
					UpdatePlayerList();
				}

				Thread.Sleep(TimeSpan.FromSeconds(5));
			}
		})
		{
			IsBackground = true
		};
		_gameListThread.Start();
	}

	private void StopGameListRefreshLoop()
	{
		if (!_gameListThreadRunning)
		{
			return;
		}

		_gameListThreadRunning = false;
		_gameListThread?.Join();
		_gameListThread = null;
	}

	public void UpdatePlayerList()
	{
		SendCommand("PLAYER", "LIST");
	}

	public void SendWatchGame(int matchID)
	{
		SendCommand("GAME", "WATCH:" + matchID);
	}

	public void AdminAuth(string password)
	{
		if (IsAdmin) return;
		SendCommand("ADMIN", "AUTH:" + password);
	}

	public void GetMoveWait()
	{
		SendCommand("GET", "MOVE_WAIT");
	}

	public void GetTournamentStatus()
	{
		SendCommand("GET", "TOURNAMENT_STATUS");
	}


	// Admin commands
	public void KickPlayer(string playerId)
	{
		if (!IsAdmin) return;
		SendCommand("ADMIN", "KICK:" + playerId);
	}

	public void StartTournament()
	{
		if (!IsAdmin) return;
		SendCommand("TOURNAMENT", "START");
	}

	public void CancelTournament()
	{
		if (!IsAdmin) return;
		SendCommand("TOURNAMENT", "CANCEL");
	}

	public void TerminateGame(int matchID)
	{
		if (!IsAdmin) return;
		SendCommand("GAME", "TERMINATE:" + matchID);
	}

	public void SetTournamentWait(float waitTime)
	{
		if (!IsAdmin) return;
		CurrentWaitTimeout = waitTime;
		SendCommand("TOURNAMENT", "WAIT:" + waitTime);
	}

	private void SendCommand(string header, string body = "")
	{
		if (!IsSocketOpen)
		{
			GD.PrintErr($"Cannot send {header}, socket is not open.");
			return;
		}

		string payload = string.IsNullOrEmpty(body) ? header : $"{header}:{body}";
		_webSocket.SendText(payload);
	}

	private void HandleServerMessage(string message)
	{
		if (string.IsNullOrWhiteSpace(message))
		{
			return;
		}

		message = message.Trim();

		string header;
		string body;
		int separatorIndex = message.IndexOf(':');
		if (separatorIndex >= 0)
		{
			header = message.Substring(0, separatorIndex).Trim();
			body = message.Substring(separatorIndex + 1).Trim();
		}
		else
		{
			header = message.Trim();
			body = string.Empty;
		}

		header = header.ToUpperInvariant();

		switch (header)
		{
			case "CONNECT":
				if (body.Equals("ACK", StringComparison.OrdinalIgnoreCase))
				{
					IsPlayer = true;
					OnConnected?.Invoke();
				}

				break;
			case "READY":
				if (body.Equals("ACK", StringComparison.OrdinalIgnoreCase))
				{
					OnReadyAcknowledged?.Invoke();
				}

				break;
			case "GAME":
				HandleGameMessage(body);
				break;
			case "PLAYER":
				HandlePlayerList(body);
				break;
			case "OPPONENT":
				if (int.TryParse(body, out int column))
				{
					OnOpponentMove?.Invoke(column);
				}
				else
				{
					GD.PrintErr($"Invalid opponent column: {body}");
				}

				break;
			case "ADMIN":
				if (body == "AUTH:ACK")
				{
					IsAdmin = true;
					GetMoveWait();
					GetTournamentStatus();
					OnBecomeAdmin?.Invoke();
				}

				break;
			case "TOURNAMENT":
				HandleTournamentMessage(body);
				break;
			case "GET":
				if (body.StartsWith("MOVE_WAIT"))
				{
					CurrentWaitTimeout = double.Parse(body.Split(":")[1]);
				} 
				else if (body.StartsWith("TOURNAMENT_STATUS"))
				{
					string status = body.Split(":")[1];
					if (status != "DEMO")
					{
						ActiveTournament = bool.Parse(status);
					}
					else
					{
						ActiveTournament = false;
						DemoMode = true;
					}
				}
				OnGetDataAcks?.Invoke();
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

	private void HandleTournamentMessage(string body)
	{
		if (string.IsNullOrWhiteSpace(body))
		{
			return;
		}

		string[] segments = body.Split(':');
		string command = segments[0].Trim().ToUpperInvariant();
		string argument = segments.Length > 1 ? segments[1].Trim() : string.Empty;

		switch (command)
		{
			case "END":
			{
				ActiveTournament = false;
				List<(string, int)> playerScoreboard = new List<(string, int)>();
				string[] entries = segments[1].Split("|");
				foreach (string entry in entries)
				{
					string[] data = entry.Split(',');
					playerScoreboard.Add((data[0], int.Parse(data[1])));
				}

				_lastScoreboard = playerScoreboard;
				_shouldShowTournamentResults = true;
				OnTournamentEnd?.Invoke();
				break;
			}
			case "START":
			{
				OnStartTournamentAck?.Invoke();
				ActiveTournament = true;
				break;
			}
			case "CANCEL":
			{
				ActiveTournament = false;
				OnCancelTournamentAck?.Invoke();
				break;
			}
		}
	}

	private void HandlePlayerList(string body)
	{
		if (string.IsNullOrWhiteSpace(body))
		{
			return;
		}

		string[] segments = body.Split(':');
		string command = segments[0].Trim().ToUpperInvariant();
		string argument = segments.Length > 1 ? segments[1].Trim() : string.Empty;

		switch (command)
		{
			case "LIST":
			{
				List<PlayerData> players = new List<PlayerData>();

				if (segments.Length < 2)
				{
					OnUpdatedPlayers?.Invoke(players);
					break;
				}

				string[] entries = segments[1].Split("|");
				foreach (string entry in entries)
				{
					string[] data = entry.Split(',');
					players.Add(new PlayerData(data[0], bool.Parse(data[1]), bool.Parse(data[2])));
				}

				OnUpdatedPlayers?.Invoke(players);
				break;
			}
		}
	}

	private void HandleGameMessage(string body)
	{
		if (string.IsNullOrWhiteSpace(body))
		{
			return;
		}

		string[] segments = body.Split(':');
		string command = segments[0].Trim().ToUpperInvariant();
		string argument = segments.Length > 1 ? segments[1].Trim() : string.Empty;

		if (IsPlayer)
		{
			switch (command)
			{
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
		}
		else // Regular observer/admin
		{
			switch (command)
			{
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

					if (segments.Length < 2)
					{
						OnUpdatedMatches?.Invoke(matches);
						break;
					}

					string[] entries = segments[1].Split("|");
					foreach (string entry in entries)
					{
						string[] data = entry.Split(',');
						matches.Add(new MatchData(int.Parse(data[0]), data[1], data[2]));
					}

					OnUpdatedMatches?.Invoke(matches);
					break;
				case "WATCH":
					CurrentObservingMatch = null;
					PreviousMoves.Clear();
					string[] activeMatchData = segments[2].Split("|");
					if (activeMatchData.IsEmpty())
					{
						string[] matchData = segments[2].Split(',');
						CurrentObservingMatch = new MatchData(int.Parse(matchData[0]), matchData[1], matchData[2]);
					}
					else
					{
						string[] matchData = activeMatchData[0].Split(',');
						CurrentObservingMatch = new MatchData(int.Parse(matchData[0]), matchData[1], matchData[2]);
						for (int i = 1; i < activeMatchData.Length; i++)
						{
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
	
	public void ShowTournamentScoreboard(List<(string, int)> playerScoreboard)
	{
		var scoreboardWindow = new Window();
		scoreboardWindow.Theme = GD.Load<Theme>("res://assets/theme.tres");
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
		tree.Theme = GD.Load<Theme>("res://assets/theme.tres");
		tree.GrowHorizontal = Control.GrowDirection.Both;
		tree.GrowVertical = Control.GrowDirection.Both;
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
		tree.SetAnchorsPreset(Control.LayoutPreset.FullRect);
		
		GetTree().Root.AddChild(scoreboardWindow);
	}
}
