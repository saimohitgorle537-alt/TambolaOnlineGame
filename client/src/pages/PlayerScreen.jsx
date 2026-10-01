import { useState, useEffect, useCallback, useRef } from 'react';
import socket from '../socket';
import Ticket from '../components/Ticket';
import NumberBoard from '../components/NumberBoard';
import CurrentNumber from '../components/CurrentNumber';
import PrizeTracker from '../components/PrizeTracker';
import PlayersList from '../components/PlayersList';
import { useSoundEffects, createConfetti, speakNumber } from '../components/SoundEffects';

export default function PlayerScreen({ onBack }) {
  const [screen, setScreen] = useState('join'); // 'join' | 'game'
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [winnerAnnouncement, setWinnerAnnouncement] = useState(null);
  const [claimFeedback, setClaimFeedback] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { playNumberCall, playWinnerSound, playMarkSound } = useSoundEffects();
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    socket.on('game:started', (state) => {
      setGameState(prev => ({ ...prev, ...state, status: 'playing' }));
    });

    socket.on('game:paused', () => {
      setGameState(prev => prev ? { ...prev, status: 'paused' } : prev);
    });

    socket.on('game:resumed', () => {
      setGameState(prev => prev ? { ...prev, status: 'playing' } : prev);
    });

    socket.on('game:number-called', (data) => {
      if (soundEnabledRef.current) {
        playNumberCall();
        speakNumber(data.number);
      }
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          numberCaller: {
            ...prev.numberCaller,
            calledNumbers: data.calledNumbers,
            lastCalled: data.number,
            remaining: data.remaining,
            totalCalled: data.totalCalled,
          },
          autoCalling: data.autoCalling || prev.autoCalling,
        };
      });
    });

    socket.on('game:timer-tick', (data) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          autoCalling: {
            ...prev.autoCalling,
            timerRemaining: data.timerRemaining,
            interval: data.interval,
            state: data.autoCallingState,
          },
        };
      });
    });

    socket.on('game:auto-calling-started', (data) => {
      setGameState(prev => prev ? { ...prev, autoCalling: data.autoCalling } : prev);
    });

    socket.on('game:auto-calling-paused', (data) => {
      setGameState(prev => prev ? { ...prev, autoCalling: data.autoCalling } : prev);
    });

    socket.on('game:auto-calling-resumed', (data) => {
      setGameState(prev => prev ? { ...prev, autoCalling: data.autoCalling } : prev);
    });

    socket.on('game:auto-calling-stopped', (data) => {
      setGameState(prev => prev ? { ...prev, autoCalling: data.autoCalling } : prev);
    });

    socket.on('game:mode-changed', (data) => {
      setGameState(prev => prev ? {
        ...prev,
        settings: data.settings,
        autoCalling: data.autoCalling,
      } : prev);
    });

    socket.on('game:settings-updated', (data) => {
      setGameState(prev => prev ? {
        ...prev,
        settings: data.settings,
        autoCalling: data.autoCalling,
      } : prev);
    });

    socket.on('game:all-numbers-called', () => {
      setClaimFeedback({ type: 'info', message: 'All 90 numbers have been called!' });
      setGameState(prev => prev ? {
        ...prev,
        status: 'finished',
        autoCalling: { ...prev.autoCalling, state: 'stopped' },
      } : prev);
    });

    socket.on('game:player-joined', (data) => {
      setGameState(prev => prev ? {
        ...prev,
        players: data.players.map(p => ({ ...p, markedCount: p.markedCount || 0 })),
        playerCount: data.playerCount,
      } : prev);
    });

    socket.on('game:player-left', (data) => {
      setGameState(prev => prev ? {
        ...prev,
        playerCount: data.playerCount,
      } : prev);
    });

    socket.on('game:winner-announced', (data) => {
      if (soundEnabledRef.current) {
        playWinnerSound();
      }
      createConfetti();
      setWinnerAnnouncement(data.claim);
      setGameState(prev => prev ? {
        ...prev,
        wonCategories: data.wonCategories,
        categoryWinners: data.categoryWinners || prev.categoryWinners,
        status: data.gameStatus,
      } : prev);

      setTimeout(() => setWinnerAnnouncement(null), 5000);
    });

    socket.on('game:claim-rejected', (claim) => {
      setClaimFeedback({ type: 'error', message: `${claim.claimName} claim was rejected: ${claim.error}` });
      setTimeout(() => setClaimFeedback(null), 4000);
    });

    socket.on('game:claim-notification', (data) => {
      if (data.status === 'pending') {
        setClaimFeedback({ type: 'info', message: `${data.playerName} claimed ${data.claimName}!` });
        setTimeout(() => setClaimFeedback(null), 3000);
      }
    });

    socket.on('game:host-disconnected', () => {
      setError('The host has disconnected. The game has ended.');
      setGameState(prev => prev ? { ...prev, status: 'finished' } : prev);
    });

    socket.on('game:reset', (state) => {
      setGameState(state);
      setClaimFeedback({ type: 'info', message: 'Game has been reset! Fresh tickets ready.' });
      setTimeout(() => setClaimFeedback(null), 3000);
    });

    socket.on('game:ended', (state) => {
      setGameState(prev => prev ? { ...prev, ...state, status: 'finished' } : prev);
    });

    socket.on('game:state-update', (state) => {
      setGameState(prev => prev ? { ...prev, ...state } : prev);
    });

    return () => {
      socket.off('game:started');
      socket.off('game:paused');
      socket.off('game:resumed');
      socket.off('game:number-called');
      socket.off('game:timer-tick');
      socket.off('game:auto-calling-started');
      socket.off('game:auto-calling-paused');
      socket.off('game:auto-calling-resumed');
      socket.off('game:auto-calling-stopped');
      socket.off('game:mode-changed');
      socket.off('game:settings-updated');
      socket.off('game:all-numbers-called');
      socket.off('game:player-joined');
      socket.off('game:player-left');
      socket.off('game:winner-announced');
      socket.off('game:claim-rejected');
      socket.off('game:claim-notification');
      socket.off('game:host-disconnected');
      socket.off('game:reset');
      socket.off('game:ended');
      socket.off('game:state-update');
    };
  }, [playNumberCall, playWinnerSound]);

  const handleJoin = useCallback((e) => {
    e.preventDefault();
    if (!roomCode.trim() || !playerName.trim()) {
      setError('Please enter both room code and your name.');
      return;
    }

    setLoading(true);
    setError('');

    socket.emit('player:join-room', {
      roomCode: roomCode.trim().toUpperCase(),
      playerName: playerName.trim(),
    }, (response) => {
      setLoading(false);
      if (response.success) {
        setGameState(response.state);
        setScreen('game');
      } else {
        setError(response.error);
      }
    });
  }, [roomCode, playerName]);

  const handleMarkNumber = useCallback((number) => {
    socket.emit('player:mark-number', { number }, (response) => {
      if (response.success) {
        if (soundEnabledRef.current) {
          playMarkSound();
        }
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            myMarkedNumbers: [...(prev.myMarkedNumbers || []), number],
          };
        });
      } else {
        setClaimFeedback({ type: 'error', message: response.error });
        setTimeout(() => setClaimFeedback(null), 3000);
      }
    });
  }, [playMarkSound]);

  const handleUnmarkNumber = useCallback((number) => {
    socket.emit('player:unmark-number', { number }, (response) => {
      if (response.success) {
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            myMarkedNumbers: (prev.myMarkedNumbers || []).filter(n => n !== number),
          };
        });
      }
    });
  }, []);

  const handleClaim = useCallback((claimType) => {
    socket.emit('player:submit-claim', { claimType }, (response) => {
      if (response.success) {
        setClaimFeedback({
          type: 'success',
          message: `${response.claim.claimName} claim submitted! Waiting for host approval...`,
        });
      } else {
        setClaimFeedback({ type: 'error', message: response.error });
      }
      setTimeout(() => setClaimFeedback(null), 4000);
    });
  }, []);

  // Join screen
  if (screen === 'join') {
    return (
      <div className="app-container">
        <div className="landing-page">
          <div className="landing-logo" style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>
            Tambola
          </div>
          <form className="join-form" onSubmit={handleJoin}>
            <h2>Join Game</h2>
            <p className="form-subtitle">Enter the room code shared by your host</p>

            <div className="form-fields">
              <div className="input-group">
                <label>Room Code</label>
                <input
                  className="input input-code"
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="ABCDEF"
                  maxLength={6}
                  autoFocus
                />
              </div>
              <div className="input-group">
                <label>Your Name</label>
                <input
                  className="input"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={20}
                />
              </div>
            </div>

            {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

            <button
              className="btn btn-primary btn-lg"
              type="submit"
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  Joining...
                </>
              ) : (
                '🎮 Join Game'
              )}
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={onBack}
              style={{ width: '100%', marginTop: '0.75rem' }}
            >
              ← Back
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Game screen
  if (!gameState) return null;

  const {
    status,
    numberCaller,
    myTicket,
    myTickets,
    myMarkedNumbers,
    wonCategories,
    categoryWinners,
    players,
    myName,
    settings,
    autoCalling,
  } = gameState;

  const calledNumbers = numberCaller?.calledNumbers || [];
  const lastCalled = numberCaller?.lastCalled || null;
  const totalCalled = numberCaller?.totalCalled || 0;
  const remaining = numberCaller?.remaining ?? 90;
  const callingMode = settings?.callingMode || 'manual';
  const callingInterval = settings?.callingInterval || 10;
  const categoryConfig = settings?.categorySettings || {};
  const autoState = autoCalling?.state || 'stopped';
  const timerSec = autoCalling?.timerRemaining ?? callingInterval;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="game-header">
        <div className="header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="header-brand">Tambola</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Hi, <strong>{myName}</strong>!
            </span>
          </div>

          <div className="header-info">
            {/* Sound Toggle */}
            <button
              className={`sound-toggle-btn ${soundEnabled ? 'active' : 'muted'}`}
              onClick={() => setSoundEnabled(v => !v)}
              title={soundEnabled ? 'Sound & Voice On' : 'Sound & Voice Muted'}
            >
              {soundEnabled ? '🔊 Sound On' : '🔇 Muted'}
            </button>

            <div className="room-code-badge">{gameState.roomCode}</div>

            <span className={`status-badge ${status}`}>
              <span className="status-dot" />
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>
      </header>

      {/* Feedback Messages */}
      {claimFeedback && (
        <div style={{ padding: '0 1rem', maxWidth: '1200px', margin: '0.5rem auto', position: 'relative', zIndex: 1 }}>
          <div className={claimFeedback.type === 'error' ? 'error-message' : 'success-message'}>
            {claimFeedback.message}
          </div>
        </div>
      )}

      {/* Waiting State */}
      {status === 'waiting' && (
        <div className="loading-container" style={{ minHeight: '60vh' }}>
          <div className="spinner" />
          <div className="loading-text">Waiting for the host to start the game...</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {(players?.length || 0)} player(s) in the room
          </div>
          <div style={{ color: 'var(--accent-primary-light)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Calling Mode: <strong>{callingMode === 'automatic' ? `Automatic (${callingInterval}s)` : 'Manual'}</strong>
          </div>
        </div>
      )}

      {/* Active Game */}
      {(status === 'playing' || status === 'paused' || status === 'finished') && (
        <div className="game-layout">
          <div className="game-main">
            {/* Current Number & Calling Mode Display */}
            <div className="panel">
              <CurrentNumber
                lastCalled={lastCalled}
                totalCalled={totalCalled}
                remaining={remaining}
                callingMode={callingMode}
                autoCallingState={autoState}
                timerRemaining={timerSec}
                interval={callingInterval}
              />

              {status === 'paused' && (
                <div style={{
                  textAlign: 'center',
                  padding: '0.75rem',
                  color: 'var(--accent-primary-light)',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                }}>
                  ⏸ Game is paused
                </div>
              )}
              {status === 'finished' && (
                <div style={{
                  textAlign: 'center',
                  padding: '0.75rem',
                  color: 'var(--accent-danger)',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                }}>
                  🏁 Game has ended
                </div>
              )}
            </div>

            {/* Ticket with multi-ticket tab support */}
            <Ticket
              ticket={myTicket}
              tickets={myTickets}
              markedNumbers={myMarkedNumbers || []}
              calledNumbers={calledNumbers}
              onMark={handleMarkNumber}
              onUnmark={handleUnmarkNumber}
              disabled={status === 'finished'}
              playerName={myName}
            />

            {/* Number Board */}
            <NumberBoard calledNumbers={calledNumbers} lastCalled={lastCalled} />
          </div>

          {/* Sidebar */}
          <div className="game-sidebar">
            {/* Prize Tracker */}
            <PrizeTracker
              wonCategories={wonCategories || {}}
              categoryWinners={categoryWinners || {}}
              categorySettings={categoryConfig}
              onClaim={status === 'playing' ? handleClaim : null}
              isPlayer={true}
              myPlayerId={socket.id}
            />

            {/* Call History */}
            {calledNumbers.length > 0 && (
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">📜 History</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {calledNumbers.length} / 90
                  </span>
                </div>
                <div className="call-history">
                  {calledNumbers.map((num, idx) => (
                    <div key={idx} className="call-history-number">{num}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Players */}
            <PlayersList players={players || []} />
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && status !== 'finished' && (
        <div className="modal-overlay" onClick={() => setError('')}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>⚠️ Error</h2>
            <p>{error}</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setError('')}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Winner Announcement Overlay */}
      {winnerAnnouncement && (
        <div className="winner-announcement" onClick={() => setWinnerAnnouncement(null)}>
          <div className="winner-card">
            <div className="winner-trophy">🏆</div>
            <div className="winner-title">{winnerAnnouncement.claimName}!</div>
            <div className="winner-name">{winnerAnnouncement.playerName}</div>
            <div className="winner-category">wins {winnerAnnouncement.claimName}</div>
            <button
              className="btn btn-gold"
              onClick={() => setWinnerAnnouncement(null)}
              style={{ marginTop: '1.5rem' }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
