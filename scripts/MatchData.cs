public class MatchData {
  public int matchId { get; private set; }
  public string player1 { get; private set; }
  public string player2 { get; private set; }

  public MatchData(int matchId, string player1, string player2) {
    this.matchId = matchId;
    this.player1 = player1;
    this.player2 = player2;
  }
}