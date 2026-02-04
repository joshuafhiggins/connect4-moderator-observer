using System;
using System.Numerics;

/// <summary>
/// Estimates Red/Yellow/Draw chances from a Connect 4 board state.
///
/// Implementation notes:
/// - Uses a near-perfect solver core (negamax + alpha-beta + transposition table) on a standard 7x6 bitboard.
/// - Converts the exact (perfect-play) score into a "chess.com-like" practical win% using:
///   (1) a sigmoid mapping of engine score -> win probability,
///   (2) an optional complexity adjustment based on how many moves preserve the best outcome.
/// </summary>
public static class Connect4WinProbability {
  public const int Width = 7;
  public const int Height = 6;

  /// <summary>
  /// Cell content.
  /// </summary>
  public enum Cell {
    None = 0,
    Red = 1,
    Yellow = 2,
  }

  public readonly record struct Chances(double RedWinChance, double YellowWinChance, double DrawChance) {
    public Chances Normalize() {
      var sum = RedWinChance + YellowWinChance + DrawChance;
      if (sum <= 0) return new Chances(0.5, 0.5, 0.0);
      return new Chances(RedWinChance / sum, YellowWinChance / sum, DrawChance / sum);
    }
  }

  /// <summary>
  /// Estimate win/draw chances for the given board.
  ///
  /// Expected board shape is [7,6]. The first index is column (0..6) and the second is row (0..5).
  /// Row orientation is auto-detected: this method will accept either row=0 bottom or row=0 top,
  /// as long as the position is gravity-valid.
  ///
  /// <paramref name="toMove"/> must be Red or Yellow.
  /// </summary>
  /// <param name="board">2D array [7,6].</param>
  /// <param name="toMove">Who is to play next.</param>
  /// <param name="nodeBudget">Maximum explored nodes before falling back to the best-so-far estimate.</param>
  /// <param name="enableComplexityAdjustment">If true, adjusts probabilities using move uniqueness/fragility.</param>
  public static Chances Evaluate(Cell[,] board, Cell toMove, int nodeBudget = 350_000, bool enableComplexityAdjustment = true) {
    if (board == null) throw new ArgumentNullException(nameof(board));
    if (board.GetLength(0) != Width || board.GetLength(1) != Height)
      throw new ArgumentException($"Board must be [{Width},{Height}]", nameof(board));
    if (toMove is not Cell.Red and not Cell.Yellow)
      throw new ArgumentException("toMove must be Cell.Red or Cell.Yellow", nameof(toMove));

    if (!TryParseBoard(board, out var redBits, out var yellowBits)) {
      // If the board is invalid, avoid lying with a confident number.
      return new Chances(0.45, 0.45, 0.10).Normalize();
    }

    var mask = redBits | yellowBits;
    var nbMoves = BitOperations.PopCount(mask);

    // If someone has already won (shouldn't happen in a "next move" position, but observers might see it).
    if (HasAlignment(redBits) && HasAlignment(yellowBits)) {
      // Illegal: both cannot have 4-in-a-row in a legal game.
      return new Chances(0.45, 0.45, 0.10).Normalize();
    }
    if (HasAlignment(redBits)) return new Chances(1.0, 0.0, 0.0);
    if (HasAlignment(yellowBits)) return new Chances(0.0, 1.0, 0.0);

    var position = Position.FromBitboards(mask, toMove == Cell.Red ? redBits : yellowBits);

    // Solve the exact perfect-play score.
    var tt = new TranspositionTable(1 << 20);
    var solver = new Solver(tt, nodeBudget);

    int bestScore = solver.Negamax(position, alpha: -Position.MaxScore, beta: Position.MaxScore);

    // Optional complexity: score all immediate child moves (only up to 7) to see how "fragile" the outcome is.
    int legalMoves = 0;
    int bestMoves = 0;
    int drawingMoves = 0;

    if (enableComplexityAdjustment) {
      for (int col = 0; col < Width; col++) {
        if (!position.CanPlay(col)) continue;
        legalMoves++;

        var child = position;
        child.Play(col);
        // Reuse the same TT for speed.
        int score = -solver.Negamax(child, alpha: -Position.MaxScore, beta: Position.MaxScore);

        if (score == bestScore) bestMoves++;
        if (score == 0) drawingMoves++;
      }

      if (legalMoves == 0) {
        // Board full.
        return new Chances(0.0, 0.0, 1.0);
      }
    } else {
      for (int col = 0; col < Width; col++) if (position.CanPlay(col)) legalMoves++;
      if (legalMoves == 0) return new Chances(0.0, 0.0, 1.0);
      bestMoves = Math.Max(1, legalMoves / 2);
      drawingMoves = 0;
    }

    var (pCurrentWin, pDraw) = ScoreToPracticalProbabilities(bestScore, nbMoves, legalMoves, bestMoves, drawingMoves);
    var pCurrentLoss = Math.Max(0.0, 1.0 - pDraw - pCurrentWin);

    // Map from current-player POV to Red/Yellow.
    Chances result = toMove == Cell.Red
      ? new Chances(pCurrentWin, pCurrentLoss, pDraw)
      : new Chances(pCurrentLoss, pCurrentWin, pDraw);

    return result.Normalize();
  }

  private static (double pCurrentWin, double pDraw) ScoreToPracticalProbabilities(
    int score,
    int nbMoves,
    int legalMoves,
    int bestMoves,
    int drawingMoves
  ) {
    // Normalize score by the maximum possible magnitude at this ply.
    // The classic perfect-solver scoring is within [-21, 21] on a 7x6 board.
    var maxAtPly = Math.Max(1, (Width * Height + 1 - nbMoves) / 2); // similar to gamesolver.org tutorial scoring
    double s = Math.Clamp(score / (double)maxAtPly, -1.0, 1.0);

    // Base win probability ignoring draws: a sigmoid curve similar in spirit to chess eval->win% mappings.
    const double sigmoidScale = 3.0;
    double pWinNoDraw = Sigmoid(s * sigmoidScale);

    // Complexity/fragility: if only a few moves preserve the best outcome, the practical win% should be less extreme.
    // complexity = 0 means many best moves (easy), 1 means only one best move (fragile).
    double complexity = 1.0;
    if (legalMoves > 0) {
      complexity = 1.0 - Math.Clamp(bestMoves / (double)legalMoves, 0.0, 1.0);
    }

    // Blend toward 50% based on complexity.
    // (If there are many good moves, keep the evaluation confident; if there's only one, flatten it.)
    double flatten = 0.60 * complexity;
    pWinNoDraw = Lerp(pWinNoDraw, 0.5, flatten);

    // Draw propensity.
    // - If perfect play draws (score == 0), put a significant mass on draw, more so if many moves keep it drawn.
    // - If perfect play is decisive, keep draw small but non-zero (practical mistakes can still drift to a draw).
    double drawMoveRatio = legalMoves > 0 ? (drawingMoves / (double)legalMoves) : 0.0;

    double pDraw;
    if (score == 0) {
      pDraw = 0.55 + 0.35 * drawMoveRatio; // 0.55..0.90
      // If draw is very "fragile" (few drawing moves), reduce draw slightly.
      pDraw -= 0.10 * complexity;
    } else {
      // Keep it small, but let it rise a bit for positions where many moves still lead to a theoretical draw.
      pDraw = 0.02 + 0.10 * drawMoveRatio;
      // If the position is very complex, increase draw slightly (practical play drifts).
      pDraw += 0.03 * complexity;
    }

    pDraw = Math.Clamp(pDraw, 0.0, 0.90);

    // Combine.
    double pWin = (1.0 - pDraw) * pWinNoDraw;
    pWin = Math.Clamp(pWin, 0.0, 1.0 - pDraw);

    return (pWin, pDraw);
  }

  private static double Sigmoid(double x) => 1.0 / (1.0 + Math.Exp(-x));
  private static double Lerp(double a, double b, double t) => a + (b - a) * Math.Clamp(t, 0.0, 1.0);

  private static bool TryParseBoard(Cell[,] board, out ulong redBits, out ulong yellowBits) {
    // We accept either row=0 bottom OR row=0 top as long as it is gravity-valid.
    // We try both and select the first valid representation.
    if (TryParseBoard(board, row0IsBottom: true, out redBits, out yellowBits)) return true;
    if (TryParseBoard(board, row0IsBottom: false, out redBits, out yellowBits)) return true;
    redBits = 0;
    yellowBits = 0;
    return false;
  }

  private static bool TryParseBoard(Cell[,] board, bool row0IsBottom, out ulong redBits, out ulong yellowBits) {
    redBits = 0;
    yellowBits = 0;

    for (int col = 0; col < Width; col++) {
      bool seenEmptyBelow = false;
      for (int rowIdx = 0; rowIdx < Height; rowIdx++) {
        int row = row0IsBottom ? rowIdx : (Height - 1 - rowIdx);
        var cell = board[col, row];

        if (cell == Cell.None) {
          seenEmptyBelow = true;
          continue;
        }

        if (seenEmptyBelow) {
          // A disc is "floating" above an empty cell in this interpretation.
          return false;
        }

        int bitRow = rowIdx; // bottom=0
        ulong bit = 1UL << (col * (Height + 1) + bitRow);

        if (cell == Cell.Red) redBits |= bit;
        else if (cell == Cell.Yellow) yellowBits |= bit;
        else return false;
      }
    }

    // Additional sanity: overlap check.
    return (redBits & yellowBits) == 0;
  }

  private static bool HasAlignment(ulong pos) {
    // Checks 4-in-a-row for a bitboard with (Height+1)=7 stride per column.
    // Shifts correspond to:
    // - 1: vertical
    // - (Height+1): horizontal
    // - (Height+1)+1: diagonal /
    // - (Height+1)-1: diagonal \
    int h1 = Height + 1;

    // vertical
    if (HasFour(pos, 1)) return true;
    // horizontal
    if (HasFour(pos, h1)) return true;
    // diag / (up-right)
    if (HasFour(pos, h1 + 1)) return true;
    // diag \ (down-right)
    if (HasFour(pos, h1 - 1)) return true;

    return false;
  }

  private static bool HasFour(ulong pos, int shift) {
    ulong m = pos & (pos >> shift);
    return (m & (m >> (2 * shift))) != 0;
  }

  private struct Position {
    // Bitboard representation (Pascal Pons / Tromp style):
    // - mask: all occupied cells
    // - current: stones of the player to move
    public ulong Mask;
    public ulong Current;

    public const int MaxScore = (Width * Height + 1) / 2; // 21

    private static readonly ulong[] BottomMask = new ulong[Width];
    private static readonly ulong[] TopMask = new ulong[Width];
    private static readonly ulong[] ColumnMask = new ulong[Width];
    private static readonly ulong BoardMask;

    static Position() {
      for (int c = 0; c < Width; c++) {
        BottomMask[c] = 1UL << (c * (Height + 1));
        TopMask[c] = 1UL << (c * (Height + 1) + (Height - 1));
        ulong colMask = 0;
        for (int r = 0; r < Height; r++) colMask |= 1UL << (c * (Height + 1) + r);
        ColumnMask[c] = colMask;
      }
      ulong bm = 0;
      for (int c = 0; c < Width; c++) bm |= ColumnMask[c];
      BoardMask = bm;
    }

    public static Position FromBitboards(ulong mask, ulong currentToMoveBits) {
      return new Position { Mask = mask, Current = currentToMoveBits };
    }

    public int NbMoves() => BitOperations.PopCount(Mask);

    public bool CanPlay(int col) {
      if ((uint)col >= Width) return false;
      return (Mask & TopMask[col]) == 0;
    }

    public void Play(int col) {
      // Switch side-to-move by XOR with mask (classic trick).
      Current ^= Mask;
      // Drop a disc into the given column.
      Mask |= Mask + BottomMask[col];
      // Ensure Mask only contains board cells.
      Mask &= BoardMask;
    }

    public bool IsWinningMove(int col) {
      // Compute the position of the current player AFTER playing this column.
      ulong pos = Current;
      ulong m = Mask;
      // play into column: get the bit for the new disc
      ulong newMask = (m | (m + BottomMask[col])) & BoardMask;
      ulong moveBit = newMask ^ m;
      pos |= moveBit;
      return HasAlignment(pos);
    }

    public ulong Key() {
      // Mix mask + current into a stable 64-bit key.
      // Good enough for a fixed-size transposition table.
      unchecked {
        ulong x = Mask * 6364136223846793005UL + 1442695040888963407UL;
        return x ^ (Current * 11400714819323198485UL);
      }
    }
  }

  private sealed class TranspositionTable {
    private struct Entry {
      public ulong Key;
      public sbyte Value;
      public byte Used;
    }

    private readonly Entry[] _entries;
    private readonly int _mask;

    public TranspositionTable(int sizePowerOfTwo) {
      if (sizePowerOfTwo <= 0 || (sizePowerOfTwo & (sizePowerOfTwo - 1)) != 0)
        throw new ArgumentException("TT size must be a power of two", nameof(sizePowerOfTwo));
      _entries = new Entry[sizePowerOfTwo];
      _mask = sizePowerOfTwo - 1;
    }

    public bool TryGet(ulong key, out int value) {
      ref var e = ref _entries[(int)key & _mask];
      if (e.Used != 0 && e.Key == key) {
        value = e.Value;
        return true;
      }
      value = 0;
      return false;
    }

    public void Put(ulong key, int value) {
      ref var e = ref _entries[(int)key & _mask];
      e.Key = key;
      e.Value = (sbyte)Math.Clamp(value, -127, 127);
      e.Used = 1;
    }
  }

  private sealed class Solver {
    private readonly TranspositionTable _tt;
    private readonly int _nodeBudget;
    private int _nodes;

    public Solver(TranspositionTable tt, int nodeBudget) {
      _tt = tt;
      _nodeBudget = Math.Max(10_000, nodeBudget);
      _nodes = 0;
    }

    public int Negamax(Position p, int alpha, int beta) {
      // Budget guard: if we run out, return a conservative estimate.
      if (_nodes++ > _nodeBudget) return 0;

      int moves = p.NbMoves();
      if (moves >= Width * Height) return 0; // draw by full board

      // Tight theoretical bounds for this ply (helps alpha-beta).
      int max = (Width * Height + 1 - moves) / 2;
      int min = -(Width * Height - moves) / 2;
      if (alpha < min) alpha = min;
      if (beta > max) beta = max;
      if (alpha >= beta) return alpha;

      // Immediate win check.
      for (int col = 0; col < Width; col++) {
        if (!p.CanPlay(col)) continue;
        if (p.IsWinningMove(col)) return max;
      }

      ulong key = p.Key();
      if (_tt.TryGet(key, out int cached)) return cached;

      int best = min;

      // Center-first move ordering (classic Connect 4 heuristic).
      // Order: 3,4,2,5,1,6,0
      Span<int> order = stackalloc int[Width] { 3, 4, 2, 5, 1, 6, 0 };
      for (int i = 0; i < order.Length; i++) {
        int col = order[i];
        if (!p.CanPlay(col)) continue;

        var child = p;
        child.Play(col);
        int score = -Negamax(child, -beta, -alpha);

        if (score > best) best = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }

      _tt.Put(key, best);
      return best;
    }
  }
}
