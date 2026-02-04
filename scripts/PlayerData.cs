public class PlayerData {
  public string Username { get; private set; }
  public bool IsReady { get; private set; }
  public bool IsPlaying { get; private set; }

  public PlayerData(string username, bool isReady, bool isPlaying) {
    Username = username;
    IsReady = isReady;
    IsPlaying = isPlaying;
  }
}