import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { apiFetch } from '../api.js';
import { useSSE } from '../hooks/useSSE.js';
import styles from './Lobby.module.css';

interface GameSummary {
  id: string;
  opponentUsername: string | null;
  opponentRating: number | null;
  playerScore: number;
  opponentScore: number;
  isYourTurn: boolean;
  status: string;
  inviteCode: string | null;
  updatedAt: string;
  ratingDelta: number | null;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  rating: number;
}

interface LobbyProps {
  userId: string;
  username: string;
  rating: number;
  onGameFinished?: () => void;
}

export function Lobby({ userId, username, rating, onGameFinished }: LobbyProps) {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [matchmaking, setMatchmaking] = useState(false);
  const [error, setError] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lobbyStats, setLobbyStats] = useState<{ onlinePlayers: number; matchmakingPlayers: number } | null>(null);

  const loadGames = useCallback(async () => {
    try {
      const data = await apiFetch<GameSummary[]>('/games');
      setGames(data);
    } catch (err: any) {
      console.error('Failed to load games:', err);
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const data = await apiFetch<LeaderboardEntry[]>('/leaderboard');
      setLeaderboard(data);
    } catch (err: any) {
      console.error('Failed to load leaderboard:', err);
    }
  }, []);

  useEffect(() => { loadGames(); loadLeaderboard(); }, [loadGames, loadLeaderboard]);

  const { connected } = useSSE({
    match_found: (data: { gameId: string }) => {
      setMatchmaking(false);
      navigate(`/game/${data.gameId}`);
    },
    game_started: () => {
      loadGames();
    },
    opponent_moved: () => loadGames(),
    game_finished: () => { loadGames(); onGameFinished?.(); },
    leaderboard_updated: () => loadLeaderboard(),
    lobby_stats: (data: { onlinePlayers: number; matchmakingPlayers: number }) => {
      setLobbyStats(data);
    },
  });

  const createGame = async () => {
    setError('');
    try {
      const result = await apiFetch<{ id: string; inviteCode: string }>('/games', { method: 'POST' });
      setInviteCode(result.inviteCode);
      loadGames();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const INVITE_CODE_RE = /^GARDEN-[A-HJ-NP-Z2-9]{6}$/;

  const joinGame = async () => {
    setError('');
    if (!INVITE_CODE_RE.test(joinCode)) {
      setError('Invalid invite code format');
      return;
    }
    try {
      const result = await apiFetch<{ id: string }>(`/games/join/${joinCode}`, { method: 'POST' });
      navigate(`/game/${result.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const findMatch = async () => {
    setError('');
    try {
      setMatchmaking(true);
      const result = await apiFetch<{ matched: boolean; gameId?: string }>('/games/matchmake', { method: 'POST' });
      if (result.matched && result.gameId) {
        navigate(`/game/${result.gameId}`);
        setMatchmaking(false);
      }
    } catch (err: any) {
      setError(err.message);
      setMatchmaking(false);
    }
  };

  const cancelMatch = async () => {
    try {
      await apiFetch('/games/matchmake', { method: 'DELETE' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setMatchmaking(false);
    }
  };

  const cancelGame = async (gameId: string) => {
    setError('');
    try {
      await apiFetch(`/games/${gameId}`, { method: 'DELETE' });
      setInviteCode('');
      loadGames();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const [showAllFinished, setShowAllFinished] = useState(false);
  const activeGames = games.filter(g => g.status === 'active');
  const waitingGames = games.filter(g => g.status === 'waiting');
  const allFinishedGames = games.filter(g => g.status === 'finished');
  const finishedGames = showAllFinished ? allFinishedGames : allFinishedGames.slice(0, 5);

  return (
    <div className={styles.lobby}>
      {!connected && <p className={styles.reconnecting}>Reconnecting...</p>}
      <div className={styles.lobbyGrid}>
        <div className={styles.sidePanel}>
          {leaderboard.length > 0 && (
            <section className={styles.leaderboard}>
              <h2 className={styles.sectionTitle}>Top 10 Players</h2>
              <ol className={styles.leaderboardList}>
                {leaderboard.map(entry => (
                  <li
                    key={entry.username}
                    className={`${styles.leaderboardEntry} ${entry.username === username ? styles.leaderboardSelf : ''}`}
                  >
                    <span className={entry.rank <= 3 ? styles.leaderboardRankTop : styles.leaderboardRank}>#{entry.rank}</span>
                    <span className={styles.leaderboardName}>{entry.username}</span>
                    <span className={styles.leaderboardRating}>{entry.rating}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {lobbyStats && (
            <section className={styles.communityStats}>
              <h2 className={styles.sectionTitle}>Community</h2>
              <div className={styles.statRow}>
                <span className={styles.statValue}>{lobbyStats.onlinePlayers}</span>
                <span className={styles.statLabel}>players online</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statValue}>{lobbyStats.matchmakingPlayers}</span>
                <span className={styles.statLabel}>searching for match</span>
              </div>
            </section>
          )}
        </div>

        <div className={styles.centerPanel}>
          <h2 className={styles.sectionTitle}>Start Playing</h2>
          <div className={styles.actions}>
            <button onClick={createGame} className={styles.actionButton}>Create Game</button>

            {matchmaking ? (
              <button onClick={cancelMatch} className={styles.actionButtonCancel}>Cancel Search</button>
            ) : (
              <button onClick={findMatch} className={styles.actionButton}>Find Match</button>
            )}

            <div className={styles.joinRow}>
              <input
                type="text"
                placeholder="Enter invite code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className={styles.joinInput}
              />
              <button onClick={joinGame} className={styles.joinButton} disabled={!joinCode}>Join</button>
            </div>
          </div>

          {inviteCode && (
            <div className={styles.inviteBox}>
              Share this code: <strong>{inviteCode}</strong>
              <button onClick={() => { navigator.clipboard.writeText(inviteCode); }} className={styles.copyButton}>Copy</button>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
          {matchmaking && <p className={styles.searching}>Searching for opponent...</p>}

          {waitingGames.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>Waiting for Opponent</h2>
              {waitingGames.map(g => (
                <div key={g.id} className={styles.gameCard}>
                  <span>Invite: {g.inviteCode}</span>
                  <button onClick={() => cancelGame(g.id)} className={styles.cancelGameButton}>Cancel</button>
                </div>
              ))}
            </section>
          )}

          {activeGames.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>Active Games</h2>
              {activeGames.map(g => (
                <div
                  key={g.id}
                  className={`${styles.gameCard} ${g.isYourTurn ? styles.yourTurn : ''}`}
                  onClick={() => navigate(`/game/${g.id}`)}
                >
                  <div className={styles.gameInfo}>
                    <span className={styles.opponent}>vs {g.opponentUsername}</span>
                    <span className={styles.score}>{g.playerScore} - {g.opponentScore}</span>
                  </div>
                  <span className={styles.turnIndicator}>
                    {g.isYourTurn ? 'Your turn' : "Opponent's turn"}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className={styles.sidePanel}>
          {finishedGames.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>Recent Games</h2>
              {finishedGames.map(g => (
                <div key={g.id} className={styles.gameCard} onClick={() => navigate(`/game/${g.id}`)}>
                  <div className={styles.gameInfo}>
                    <span className={styles.opponent}>vs {g.opponentUsername}</span>
                    <span className={styles.score}>{g.playerScore} - {g.opponentScore}</span>
                  </div>
                  <div className={styles.finishedInfo}>
                    <span className={styles.finished}>
                      {g.playerScore > g.opponentScore ? 'Won' : g.playerScore < g.opponentScore ? 'Lost' : 'Draw'}
                    </span>
                    {g.ratingDelta != null && (
                      <span className={g.ratingDelta >= 0 ? styles.ratingUp : styles.ratingDown}>
                        {g.ratingDelta >= 0 ? '+' : ''}{g.ratingDelta}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {allFinishedGames.length > 5 && (
                <button
                  onClick={() => setShowAllFinished(prev => !prev)}
                  className={styles.showMoreButton}
                >
                  {showAllFinished ? 'Show Less' : `Show All (${allFinishedGames.length})`}
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
