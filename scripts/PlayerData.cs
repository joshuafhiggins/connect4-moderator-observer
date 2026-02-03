public class PlayerData {
  public string username { get; private set; }
  public bool isReady { get; private set; }
  public bool isPlaying { get; private set; }

  public PlayerData(string username, bool isReady, bool isPlaying) {
    this.username = username;
    this.isReady = isReady;
    this.isPlaying = isPlaying;
  }
}