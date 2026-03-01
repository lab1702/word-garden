import { randomInt } from 'node:crypto';
import { validatePlacement, findFormedWords, scoreMove } from './gameEngine.js';
import { isValidWord } from './dictionary.js';
import { updateRatings } from './ratings.js';
import { RACK_SIZE, LETTER_POINTS, MAX_CONSECUTIVE_PASSES, BOARD_SIZE } from '@word-garden/shared';
import type { TilePlacement, Tile } from '@word-garden/shared';
import type { PoolClient, GameRow } from '../types.js';

type ErrorResult = { type: 'error'; status: number; error: string };
type PlayResult = { type: 'success'; score: number; wordScores: { word: string; score: number }[]; bingo: boolean; newRack: Tile[]; gameOver: boolean; opponentId: string };
type PassResult = { type: 'success'; gameOver: boolean; opponentId: string };
type ExchangeResult = { type: 'success'; newRack: Tile[]; opponentId: string };

export async function handlePlayMove(
  client: PoolClient,
  g: GameRow,
  userId: string,
  tiles: TilePlacement[] | undefined,
): Promise<PlayResult | ErrorResult> {
  const isPlayer1 = g.player1_id === userId;
  const isPlayer2 = g.player2_id === userId;
  if (g.player1_id == null || g.player2_id == null) {
    return { type: 'error', status: 409, error: 'Game is no longer valid' };
  }
  const board = g.board_state.map((row: any[]) => row.map((cell: any) => ({ ...cell, tile: cell.tile ? { ...cell.tile } : null })));
  const rack: Tile[] = isPlayer1 ? g.player1_rack : g.player2_rack;
  const tileBag: Tile[] = [...g.tile_bag];
  const isFirstMove = board.every((row: any[]) => row.every((cell: any) => cell.tile === null));

  if (!Array.isArray(tiles) || tiles.length === 0 || tiles.length > RACK_SIZE) {
    return { type: 'error', status: 400, error: 'Invalid tiles' };
  }

  for (const t of tiles) {
    if (!t || typeof t !== 'object') {
      return { type: 'error', status: 400, error: 'Invalid tile placement data' };
    }
    if (typeof t.row !== 'number' || typeof t.col !== 'number' ||
        !Number.isInteger(t.row) || !Number.isInteger(t.col) ||
        t.row < 0 || t.row >= BOARD_SIZE || t.col < 0 || t.col >= BOARD_SIZE ||
        typeof t.letter !== 'string' || t.letter.length !== 1 || !/^[A-Za-z]$/.test(t.letter) ||
        typeof t.isBlank !== 'boolean') {
      return { type: 'error', status: 400, error: 'Invalid tile placement data' };
    }
    t.letter = t.letter.toUpperCase();
  }

  // Validate tiles are in player's rack
  const rackCopy = [...rack];
  for (const t of tiles) {
    const idx = rackCopy.findIndex(r =>
      t.isBlank ? r.letter === '' : r.letter === t.letter
    );
    if (idx === -1) {
      return { type: 'error', status: 400, error: `Tile ${t.letter} not in your rack` };
    }
    rackCopy.splice(idx, 1);
  }

  // Validate placement
  const validation = validatePlacement(board, tiles, isFirstMove);
  if (!validation.valid) {
    return { type: 'error', status: 400, error: validation.error! };
  }

  // Check all formed words are valid
  const words = findFormedWords(board, tiles);
  if (words.length === 0) {
    return { type: 'error', status: 400, error: 'Move must form at least one word' };
  }
  for (const w of words) {
    if (!isValidWord(w.word)) {
      return { type: 'error', status: 400, error: `"${w.word}" is not a valid word` };
    }
  }

  // Score the move
  const scoreResult = scoreMove(board, tiles);

  // Update board
  for (const t of tiles) {
    board[t.row][t.col].tile = {
      letter: t.letter,
      points: t.isBlank ? 0 : (LETTER_POINTS.get(t.letter.toUpperCase()) ?? 0),
    };
  }

  // Draw new tiles
  const newRack = [...rackCopy];
  const drawCount = Math.min(tiles.length, tileBag.length);
  for (let i = 0; i < drawCount; i++) {
    newRack.push(tileBag.shift()!);
  }

  // Update scores
  const rackField = isPlayer1 ? 'player1_rack' : 'player2_rack';
  const newScore = (isPlayer1 ? g.player1_score : g.player2_score) + scoreResult.totalScore;

  // Check if game is over (player used all tiles and bag is empty)
  let gameOver = false;
  let winnerId = null;
  let p1Score = isPlayer1 ? newScore : g.player1_score;
  let p2Score = isPlayer2 ? newScore : g.player2_score;

  if (newRack.length === 0 && tileBag.length === 0) {
    gameOver = true;
    // Add opponent's remaining tile points to this player's score
    const opponentRack: Tile[] = isPlayer1 ? g.player2_rack : g.player1_rack;
    const opponentTilePoints = opponentRack.reduce((sum: number, t: Tile) => sum + t.points, 0);
    if (isPlayer1) {
      p1Score += opponentTilePoints;
      p2Score -= opponentTilePoints;
    } else {
      p2Score += opponentTilePoints;
      p1Score -= opponentTilePoints;
    }
    winnerId = p1Score > p2Score ? g.player1_id : p2Score > p1Score ? g.player2_id : null;
  }

  // Record move
  await client.query(
    `INSERT INTO moves (game_id, player_id, move_type, tiles_placed, words_formed, score)
     VALUES ($1, $2, 'play', $3, $4, $5)`,
    [g.id, userId, JSON.stringify(tiles), JSON.stringify(scoreResult.wordScores), scoreResult.totalScore],
  );

  // Update game state
  await client.query(
    `UPDATE games SET board_state = $1, tile_bag = $2, ${rackField} = $3,
     player1_score = $4, player2_score = $5, current_turn = $6,
     consecutive_passes = 0, status = $7, winner_id = $8, updated_at = NOW()
     WHERE id = $9`,
    [JSON.stringify(board), JSON.stringify(tileBag), JSON.stringify(newRack),
     p1Score, p2Score, g.current_turn === 1 ? 2 : 1,
     gameOver ? 'finished' : 'active', winnerId, g.id],
  );

  if (gameOver) {
    const ratingChanges = await updateRatings(client, g.player1_id, g.player2_id, winnerId);
    if (ratingChanges) {
      await client.query(
        `UPDATE games SET
          player1_rating_before = $1, player1_rating_after = $2,
          player1_rank_before = $3, player1_rank_after = $4,
          player2_rating_before = $5, player2_rating_after = $6,
          player2_rank_before = $7, player2_rank_after = $8
        WHERE id = $9`,
        [
          ratingChanges.player1.ratingBefore, ratingChanges.player1.ratingAfter,
          ratingChanges.player1.rankBefore, ratingChanges.player1.rankAfter,
          ratingChanges.player2.ratingBefore, ratingChanges.player2.ratingAfter,
          ratingChanges.player2.rankBefore, ratingChanges.player2.rankAfter,
          g.id,
        ],
      );
    }
  }

  const opponentId = isPlayer1 ? g.player2_id : g.player1_id;

  return {
    type: 'success',
    score: scoreResult.totalScore,
    wordScores: scoreResult.wordScores,
    bingo: scoreResult.bingo,
    newRack,
    gameOver,
    opponentId,
  };
}

export async function handlePassMove(
  client: PoolClient,
  g: GameRow,
  userId: string,
): Promise<PassResult | ErrorResult> {
  const isPlayer1 = g.player1_id === userId;
  if (g.player1_id == null || g.player2_id == null) {
    return { type: 'error', status: 409, error: 'Game is no longer valid' };
  }

  const newConsecutivePasses = g.consecutive_passes + 1;
  let gameOver = newConsecutivePasses >= MAX_CONSECUTIVE_PASSES;
  let winnerId = null;

  if (gameOver) {
    // Deduct remaining tile points from each player
    const p1Rack: Tile[] = g.player1_rack;
    const p2Rack: Tile[] = g.player2_rack;
    const p1Deduct = p1Rack.reduce((s: number, t: Tile) => s + t.points, 0);
    const p2Deduct = p2Rack.reduce((s: number, t: Tile) => s + t.points, 0);
    const p1Score = g.player1_score - p1Deduct;
    const p2Score = g.player2_score - p2Deduct;
    winnerId = p1Score > p2Score ? g.player1_id : p2Score > p1Score ? g.player2_id : null;

    await client.query(
      `UPDATE games SET current_turn = $1, consecutive_passes = $2,
       player1_score = $3, player2_score = $4, status = 'finished', winner_id = $5, updated_at = NOW()
       WHERE id = $6`,
      [g.current_turn === 1 ? 2 : 1, newConsecutivePasses, p1Score, p2Score, winnerId, g.id],
    );
    const ratingChanges = await updateRatings(client, g.player1_id, g.player2_id, winnerId);
    if (ratingChanges) {
      await client.query(
        `UPDATE games SET
          player1_rating_before = $1, player1_rating_after = $2,
          player1_rank_before = $3, player1_rank_after = $4,
          player2_rating_before = $5, player2_rating_after = $6,
          player2_rank_before = $7, player2_rank_after = $8
        WHERE id = $9`,
        [
          ratingChanges.player1.ratingBefore, ratingChanges.player1.ratingAfter,
          ratingChanges.player1.rankBefore, ratingChanges.player1.rankAfter,
          ratingChanges.player2.ratingBefore, ratingChanges.player2.ratingAfter,
          ratingChanges.player2.rankBefore, ratingChanges.player2.rankAfter,
          g.id,
        ],
      );
    }
  } else {
    await client.query(
      `UPDATE games SET current_turn = $1, consecutive_passes = $2, updated_at = NOW() WHERE id = $3`,
      [g.current_turn === 1 ? 2 : 1, newConsecutivePasses, g.id],
    );
  }

  await client.query(
    `INSERT INTO moves (game_id, player_id, move_type, score) VALUES ($1, $2, 'pass', 0)`,
    [g.id, userId],
  );

  const opponentId = isPlayer1 ? g.player2_id : g.player1_id;

  return {
    type: 'success',
    gameOver,
    opponentId,
  };
}

export async function handleExchangeMove(
  client: PoolClient,
  g: GameRow,
  userId: string,
  exchangeTiles: number[] | undefined,
): Promise<ExchangeResult | ErrorResult> {
  const isPlayer1 = g.player1_id === userId;
  if (g.player1_id == null || g.player2_id == null) {
    return { type: 'error', status: 409, error: 'Game is no longer valid' };
  }
  const rack: Tile[] = isPlayer1 ? g.player1_rack : g.player2_rack;
  const tileBag: Tile[] = [...g.tile_bag];

  if (!Array.isArray(exchangeTiles) || exchangeTiles.length === 0) {
    return { type: 'error', status: 400, error: 'No tiles to exchange' };
  }
  if (exchangeTiles.length > rack.length) {
    return { type: 'error', status: 400, error: 'Too many tiles to exchange' };
  }
  if (!exchangeTiles.every((i: number) => Number.isInteger(i) && i >= 0 && i < rack.length)) {
    return { type: 'error', status: 400, error: 'Invalid tile indices' };
  }
  if (new Set(exchangeTiles).size !== exchangeTiles.length) {
    return { type: 'error', status: 400, error: 'Duplicate tile indices' };
  }
  if (tileBag.length < exchangeTiles.length) {
    return { type: 'error', status: 400, error: 'Not enough tiles in bag' };
  }

  const newRack = rack.filter((_: Tile, i: number) => !exchangeTiles.includes(i));
  const returned: Tile[] = exchangeTiles.map((i: number) => rack[i]);

  // Draw new tiles
  for (let i = 0; i < exchangeTiles.length; i++) {
    newRack.push(tileBag.shift()!);
  }
  // Put returned tiles back in bag and shuffle
  tileBag.push(...returned);
  for (let i = tileBag.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [tileBag[i], tileBag[j]] = [tileBag[j], tileBag[i]];
  }

  const rackField = isPlayer1 ? 'player1_rack' : 'player2_rack';

  await client.query(
    `UPDATE games SET ${rackField} = $1, tile_bag = $2, current_turn = $3,
     consecutive_passes = 0, updated_at = NOW() WHERE id = $4`,
    [JSON.stringify(newRack), JSON.stringify(tileBag), g.current_turn === 1 ? 2 : 1, g.id],
  );

  await client.query(
    `INSERT INTO moves (game_id, player_id, move_type, score) VALUES ($1, $2, 'exchange', 0)`,
    [g.id, userId],
  );

  const opponentId = isPlayer1 ? g.player2_id : g.player1_id;

  return {
    type: 'success',
    newRack,
    opponentId,
  };
}
