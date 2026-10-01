import { useState, useEffect, useCallback, useRef } from 'react';
import socket from '../socket';
import NumberBoard from '../components/NumberBoard';
import CurrentNumber from '../components/CurrentNumber';
import PrizeTracker from '../components/PrizeTracker';
import PlayersList from '../components/PlayersList';
import { useSoundEffects, createConfetti, speakNumber } from '../components/SoundEffects';

const INTERVAL_PRESETS = [3, 5, 10, 15, 20, 30, 60];

export default function HostScreen({ onBack }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [winnerAnnouncement, setWinnerAnnouncement] = useState(null);
  const [customInterval, setCustomInterval] = useState('');
  const { playNumberCall, playWinnerSound } = useSoundEffects();
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Create room on mount
  useEffect(() => {
    socket.emit('host:create-room', (response) => {
      setLoading(false);
      if (response.success) {
        setGameState(response.state || { roomCode: response.roomCode, status: 'waiting' });
      } else {
        setError(response.error || 'Failed to create room');
      }
    });

    // Socket Event Listeners
    socket.on('game:player-joined', (data) => {
      setGameState(prev => prev ? {
        ...prev,
        players: data.players.map(p => ({ ...p, markedCount: 0 })),
        playerCount: data.playerCount,
      } : prev);
    });

    socket.on('game:player-left', (data) => {
      setGameState(prev => prev ? {
        ...prev,
        playerCount: data.playerCount,
      } : prev);
      socket.emit('host:get-state', (response) => {
        if (response.success) setGameState(response.state);
      });
    });

    socket.on('game:player-marked', (data) => {
      setGameState(prev => {
        if (!prev) return prev;
        const players = prev.players?.map(p =>
          p.id === data.playerId ? { ...p, markedCount: data.markedCount } : p
        );
        return { ...prev, players };
      });
    });

    socket.on('game:claim-submitted', (data) => {
      setGameState(prev => prev ? {
        ...prev,
        pendingClaims: data.pendingClaims,
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
        pendingClaims: prev.pendingClaims?.filter(c => c.claimType !== data.claim.claimType) || [],
      } : prev);

      setTimeout(() => setWinnerAnnouncement(null), 5000);
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
      setGameState(prev => prev ? {
        ...prev,
        status: 'finished',
        autoCalling: { ...prev.autoCalling, state: 'stopped' },
      } : prev);
    });

    socket.on('game:state-update', (state) => {
      setGameState(prev => prev ? { ...prev, ...state } : prev);
    });

    return () => {
      socket.off('game:player-joined');
      socket.off('game:player-left');
      socket.off('game:player-marked');
      socket.off('game:claim-submitted');
      socket.off('game:winner-announced');
      socket.off('game:number-called');
      socket.off('game:timer-tick');
      socket.off('game:auto-calling-started');
      socket.off('game:auto-calling-paused');
      socket.off('game:auto-calling-resumed');
      socket.off('game:auto-calling-stopped');
      socket.off('game:mode-changed');
      socket.off('game:settings-updated');
      socket.off('game:all-numbers-called');
      socket.off('game:state-update');
    };
  }, [playNumberCall, playWinnerSound]);

  // Handle Game Controls
  const handleStartGame = useCallback(() => {
    socket.emit('host:start-game', (response) => {
      if (response.success) {
        setGameState(prev => ({ ...prev, ...response.state }));
      } else {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, []);

  const handleCallNumber = useCallback(() => {
    socket.emit('host:call-number', (response) => {
      if (response.success) {
        if (soundEnabledRef.current) {
          playNumberCall();
          speakNumber(response.number);
        }
      } else {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, [playNumberCall]);

  const handleStartAutoCalling = useCallback(() => {
    socket.emit('host:start-auto-calling', (response) => {
      if (!response.success) {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, []);

  const handlePauseAutoCalling = useCallback(() => {
    socket.emit('host:pause-auto-calling', (response) => {
      if (!response.success) {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, []);

  const handleResumeAutoCalling = useCallback(() => {
    socket.emit('host:resume-auto-calling', (response) => {
      if (!response.success) {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, []);

  const handleStopAutoCalling = useCallback(() => {
    socket.emit('host:stop-auto-calling', (response) => {
      if (!response.success) {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, []);

  const handleSwitchMode = useCallback((mode) => {
    const currentInterval = gameState?.settings?.callingInterval || 10;
    socket.emit('host:switch-mode', { mode, interval: currentInterval }, (response) => {
      if (!response.success) {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, [gameState]);

  const handleSelectInterval = useCallback((sec) => {
    const num = Number(sec);
    if (num < 1) return;
    socket.emit('host:update-settings', { callingInterval: num }, (response) => {
      if (!response.success) {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, []);

  const handleUpdateTicketsPerPlayer = useCallback((count) => {
    socket.emit('host:update-settings', { maxTicketsPerPlayer: count }, (response) => {
      if (!response.success) {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, []);

  const handleCategoryToggle = useCallback((categoryKey, enabled) => {
    socket.emit('host:update-settings', {
      categorySettings: {
        [categoryKey]: { enabled },
      },
    });
  }, []);

  const handleCategoryMaxWinners = useCallback((categoryKey, maxWinners) => {
    const count = Math.max(1, Math.min(5, Number(maxWinners) || 1));
    socket.emit('host:update-settings', {
      categorySettings: {
        [categoryKey]: { maxWinners: count },
      },
    });
  }, []);

  const handlePauseGame = useCallback(() => {
    socket.emit('host:pause-game', (response) => {
      if (response.success) {
        setGameState(prev => prev ? { ...prev, status: 'paused' } : prev);
      }
    });
  }, []);

  const handleResumeGame = useCallback(() => {
    socket.emit('host:resume-game', (response) => {
      if (response.success) {
        setGameState(prev => prev ? { ...prev, status: 'playing' } : prev);
      }
    });
  }, []);

  const handleEndGame = useCallback(() => {
    if (window.confirm('Are you sure you want to end the game?')) {
      socket.emit('host:end-game', (response) => {
        if (response.success) {
          setGameState(prev => prev ? { ...prev, status: 'finished' } : prev);
        }
      });
    }
  }, []);

  const handleResetGame = useCallback(() => {
    if (window.confirm('Reset the game? All progress will be lost and new tickets generated.')) {
      socket.emit('host:reset-game', (response) => {
        if (response.success) {
          setGameState(response.state);
        }
      });
    }
  }, []);

  const handleApproveClaim = useCallback((claimId) => {
    socket.emit('host:approve-claim', { claimId }, (response) => {
      if (!response.success) {
        setError(response.error);
        setTimeout(() => setError(''), 3000);
      }
    });
  }, []);

  const handleRejectClaim = useCallback((claimId) => {
    socket.emit('host:reject-claim', { claimId }, (response) => {
      if (response.success) {
        setGameState(prev => prev ? {
          ...prev,
          pendingClaims: prev.pendingClaims?.filter(c => c.id !== claimId) || [],
        } : prev);
      }
    });
  }, []);

  const copyRoomCode = () => {
    if (gameState?.roomCode) {
      navigator.clipboard.writeText(gameState.roomCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading-container" style={{ minHeight: '100vh' }}>
          <div className="spinner" />
          <div className="loading-text">Creating your game room...</div>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="app-container">
        <div className="loading-container" style={{ minHeight: '100vh' }}>
          <div style={{ color: 'var(--accent-danger)', fontSize: '1.2rem' }}>
            {error || 'Something went wrong'}
          </div>
          <button className="btn btn-primary" onClick={onBack}>Go Back</button>
        </div>
      </div>
    );
  }

  const { status, numberCaller, players, wonCategories, categoryWinners, pendingClaims, settings, autoCalling } = gameState;
  const calledNumbers = numberCaller?.calledNumbers || [];
  const lastCalled = numberCaller?.lastCalled || null;
  const totalCalled = numberCaller?.totalCalled || 0;
  const remaining = numberCaller?.remaining ?? 90;
  const callingMode = settings?.callingMode || 'manual';
  const callingInterval = settings?.callingInterval || 10;
  const maxTickets = settings?.maxTicketsPerPlayer || 1;
  const categoryConfig = settings?.categorySettings || {};
  const autoState = autoCalling?.state || 'stopped';
  const timerSec = autoCalling?.timerRemaining ?? callingInterval;

  const categoriesList = [
    { key: 'top_line', label: 'First Line', defaultMax: 1 },
    { key: 'middle_line', label: 'Middle Line', defaultMax: 1 },
    { key: 'bottom_line', label: 'Bottom Line', defaultMax: 1 },
    { key: 'full_house', label: 'Full House', defaultMax: 1 },
    { key: 'early_five', label: 'Early Five', defaultMax: 1 },
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="game-header">
        <div className="header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>
            <span className="header-brand">Tambola</span>
            <span className="host-badge">HOST</span>
          </div>

          <div className="header-info">
            {/* Sound Mute/Unmute Toggle */}
            <button
              className={`sound-toggle-btn ${soundEnabled ? 'active' : 'muted'}`}
              onClick={() => setSoundEnabled(v => !v)}
              title={soundEnabled ? 'Sound & Voice On' : 'Sound & Voice Muted'}
            >
              {soundEnabled ? '🔊 Sound On' : '🔇 Muted'}
            </button>

            <div
              className="room-code-badge"
              onClick={copyRoomCode}
              title="Click to copy room code"
            >
              {copied ? '✅ Copied!' : gameState.roomCode}
            </div>

            <span className={`status-badge ${status}`}>
              <span className="status-dot" />
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="game-layout">
        <div className="game-main">
          {/* Top Panel: Current Number & Controls */}
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

            {/* Calling Mode & Controls Card */}
            <div className="calling-control-box">
              {/* Mode Selector */}
              <div className="control-row mode-select-row">
                <span className="control-label">NUMBER CALLING MODE:</span>
                <div className="mode-toggle-group">
                  <button
                    type="button"
                    className={`mode-btn ${callingMode === 'manual' ? 'active' : ''}`}
                    onClick={() => handleSwitchMode('manual')}
                  >
                    <span className="mode-radio-circle">{callingMode === 'manual' ? '●' : '○'}</span>
                    Manual
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${callingMode === 'automatic' ? 'active' : ''}`}
                    onClick={() => handleSwitchMode('automatic')}
                  >
                    <span className="mode-radio-circle">{callingMode === 'automatic' ? '●' : '○'}</span>
                    Automatic
                  </button>
                </div>
              </div>

              {/* Automatic Mode Config & Timer Controls */}
              {callingMode === 'automatic' && (
                <div className="auto-mode-controls">
                  <div className="control-row interval-config-row">
                    <span className="control-label">CALLING INTERVAL:</span>
                    <div className="interval-chips">
                      {INTERVAL_PRESETS.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          className={`interval-chip ${callingInterval === sec ? 'selected' : ''}`}
                          onClick={() => handleSelectInterval(sec)}
                          disabled={autoState === 'running'}
                        >
                          {sec}s
                        </button>
                      ))}
                      <div className="custom-interval-wrapper">
                        <input
                          type="number"
                          min="1"
                          max="300"
                          placeholder="Custom"
                          value={customInterval}
                          onChange={(e) => setCustomInterval(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && customInterval) {
                              handleSelectInterval(customInterval);
                              setCustomInterval('');
                            }
                          }}
                          disabled={autoState === 'running'}
                          className="custom-interval-input"
                        />
                        {customInterval && (
                          <button
                            type="button"
                            className="btn btn-outline btn-xs"
                            onClick={() => {
                              handleSelectInterval(customInterval);
                              setCustomInterval('');
                            }}
                          >
                            Set
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Auto-Calling Action Buttons */}
                  {status === 'playing' && (
                    <div className="auto-actions-row">
                      {autoState === 'stopped' && (
                        <button
                          className="btn btn-success btn-lg btn-action-glow"
                          onClick={handleStartAutoCalling}
                          disabled={remaining === 0}
                        >
                          ▶ START AUTO CALLING
                        </button>
                      )}

                      {autoState === 'running' && (
                        <div className="running-controls-group">
                          <button
                            className="btn btn-warning btn-md"
                            onClick={handlePauseAutoCalling}
                          >
                            ⏸ PAUSE
                          </button>
                          <button
                            className="btn btn-danger btn-md"
                            onClick={handleStopAutoCalling}
                          >
                            ⏹ STOP
                          </button>
                        </div>
                      )}

                      {autoState === 'paused' && (
                        <div className="running-controls-group">
                          <button
                            className="btn btn-success btn-md"
                            onClick={handleResumeAutoCalling}
                          >
                            ▶ RESUME
                          </button>
                          <button
                            className="btn btn-danger btn-md"
                            onClick={handleStopAutoCalling}
                          >
                            ⏹ STOP
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Manual Mode Action Controls */}
              {callingMode === 'manual' && status === 'playing' && (
                <div className="manual-actions-row">
                  <button
                    className="btn btn-call btn-lg"
                    onClick={handleCallNumber}
                    disabled={remaining === 0}
                  >
                    🎲 CALL NEXT NUMBER
                  </button>
                </div>
              )}

              {/* Game Flow Controls (Start, Pause, Resume, End, New Game) */}
              <div className="game-flow-row">
                {status === 'waiting' && (
                  <button
                    className="btn btn-success btn-lg btn-action-glow"
                    onClick={handleStartGame}
                    disabled={!players || players.length === 0}
                  >
                    🚀 Start Game
                  </button>
                )}

                {status === 'playing' && (
                  <div className="flow-secondary-buttons">
                    <button className="btn btn-outline btn-sm" onClick={handlePauseGame}>
                      ⏸ Pause Game
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={handleEndGame}>
                      End Game
                    </button>
                  </div>
                )}

                {status === 'paused' && (
                  <div className="flow-secondary-buttons">
                    <button className="btn btn-success btn-sm" onClick={handleResumeGame}>
                      ▶ Resume Game
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={handleEndGame}>
                      End Game
                    </button>
                  </div>
                )}

                {status === 'finished' && (
                  <button className="btn btn-primary btn-lg" onClick={handleResetGame}>
                    🔄 New Game
                  </button>
                )}
              </div>
            </div>

            {error && <div className="error-message" style={{ margin: '0.5rem 1rem' }}>{error}</div>}
          </div>

          {/* Waiting Room Settings Panel */}
          {status === 'waiting' && (
            <div className="panel settings-panel">
              <div className="panel-header">
                <span className="panel-title">⚙️ Game Settings</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Configure before starting
                </span>
              </div>
              <div className="panel-body">
                {/* Max Tickets Per Player */}
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-title">Maximum Tickets Per Player</div>
                    <div className="settings-desc">Choose how many tickets each player receives</div>
                  </div>
                  <div className="pill-stepper">
                    {[1, 2, 3].map(count => (
                      <button
                        key={count}
                        type="button"
                        className={`pill-option ${maxTickets === count ? 'active' : ''}`}
                        onClick={() => handleUpdateTicketsPerPlayer(count)}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Categories & Max Winners */}
                <div className="settings-section-divider">
                  <span className="section-title">WINNING CATEGORIES</span>
                </div>

                <div className="categories-config-list">
                  {categoriesList.map(cat => {
                    const cfg = categoryConfig[cat.key] || { enabled: true, maxWinners: cat.defaultMax };
                    return (
                      <div key={cat.key} className="category-config-row">
                        <label className="category-checkbox-label">
                          <input
                            type="checkbox"
                            checked={cfg.enabled}
                            onChange={(e) => handleCategoryToggle(cat.key, e.target.checked)}
                            className="custom-checkbox"
                          />
                          <span className="category-name-text">{cat.label}</span>
                        </label>

                        <div className="category-winners-control">
                          <span className="winners-label">Maximum Winners:</span>
                          <select
                            value={cfg.maxWinners || 1}
                            onChange={(e) => handleCategoryMaxWinners(cat.key, e.target.value)}
                            disabled={!cfg.enabled}
                            className="winners-select"
                          >
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Call History */}
          {calledNumbers.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">📜 Call History</span>
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

          {/* Number Board */}
          <NumberBoard calledNumbers={calledNumbers} lastCalled={lastCalled} />
        </div>

        {/* Sidebar */}
        <div className="game-sidebar">
          {/* Share Room Code Card */}
          {status === 'waiting' && (
            <div className="panel share-card">
              <div className="panel-body" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Share this code with players
                </div>
                <div
                  className="room-code-display"
                  onClick={copyRoomCode}
                  title="Click to copy"
                >
                  {gameState.roomCode}
                </div>
                <button className="btn btn-outline btn-sm" onClick={copyRoomCode} style={{ marginTop: '0.75rem' }}>
                  {copied ? '✅ Copied!' : '📋 Copy Code'}
                </button>
              </div>
            </div>
          )}

          {/* Pending Claims Review */}
          {pendingClaims && pendingClaims.length > 0 && (
            <div className="panel" style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
              <div className="panel-header" style={{ background: 'rgba(245, 158, 11, 0.08)' }}>
                <span className="panel-title">🔔 Pending Claims</span>
                <span className="claims-badge">{pendingClaims.length}</span>
              </div>
              <div className="panel-body">
                {pendingClaims.map(claim => (
                  <div key={claim.id} className="claim-item">
                    <div className="claim-info">
                      <div className="claim-player">{claim.playerName}</div>
                      <div className="claim-type">{claim.claimName}</div>
                    </div>
                    <div className="claim-actions">
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleApproveClaim(claim.id)}
                        title="Approve Claim"
                      >
                        ✓
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRejectClaim(claim.id)}
                        title="Reject Claim"
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prizes Tracker */}
          <PrizeTracker
            wonCategories={wonCategories || {}}
            categoryWinners={categoryWinners || {}}
            categorySettings={categoryConfig}
          />

          {/* Players List */}
          <PlayersList players={players || []} />
        </div>
      </div>

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
