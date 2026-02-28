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
}

interface LobbyProps {
  username: string;
  rating: number;
}

export function Lobby({ username, rating }: LobbyProps) {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [matchmaking, setMatchmaking] = useState(false);
  const [error, setError] = useState('');

  const loadGames = useCallback(async () => {
    try {
      const data = await apiFetch<GameSummary[]>('/games');
      setGames(data);
    } catch (err: any) {
      console.error('Failed to load games:', err);
    }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);

  useSSE({
    match_found: (data: { gameId: string }) => {
      setMatchmaking(false);
      navigate(`/game/${data.gameId}`);
    },
    game_started: () => {
      loadGames();
    },
    opponent_moved: () => loadGames(),
    game_finished: () => loadGames(),
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

  const joinGame = async () => {
    setError('');
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

  const activeGames = games.filter(g => g.status === 'active');
  const waitingGames = games.filter(g => g.status === 'waiting');
  const finishedGames = games.filter(g => g.status === 'finished').slice(0, 5);

  return (
    <div className={styles.lobby}>
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

      {finishedGames.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>Recent Games</h2>
          {finishedGames.map(g => (
            <div key={g.id} className={styles.gameCard} onClick={() => navigate(`/game/${g.id}`)}>
              <div className={styles.gameInfo}>
                <span className={styles.opponent}>vs {g.opponentUsername}</span>
                <span className={styles.score}>{g.playerScore} - {g.opponentScore}</span>
              </div>
              <span className={styles.finished}>
                {g.playerScore > g.opponentScore ? 'Won' : g.playerScore < g.opponentScore ? 'Lost' : 'Draw'}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
