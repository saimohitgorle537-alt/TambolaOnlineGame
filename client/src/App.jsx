import { useState, useEffect } from 'react';
import socket from './socket';
import HostScreen from './pages/HostScreen';
import PlayerScreen from './pages/PlayerScreen';

function App() {
  const [screen, setScreen] = useState('landing'); // 'landing' | 'host' | 'player'
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  if (screen === 'host') {
    return <HostScreen onBack={() => setScreen('landing')} />;
  }

  if (screen === 'player') {
    return <PlayerScreen onBack={() => setScreen('landing')} />;
  }

  return (
    <div className="app-container">
      <div className="landing-page">
        <div className="landing-logo">
          {'Tambola'.split('').map((char, i) => (
            <span key={i}>{char}</span>
          ))}
        </div>
        <p className="landing-subtitle">
          The classic number game — now play with friends online!
        </p>

        {!connected && (
          <div className="error-message" style={{ marginBottom: '1.5rem', maxWidth: '400px' }}>
            ⚠️ Connecting to server... Make sure the server is running on port 3001.
          </div>
        )}

        <div className="landing-actions">
          <div
            className="action-card"
            onClick={() => setScreen('host')}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setScreen('host')}
          >
            <div className="action-card-icon">🎙️</div>
            <h3>Host a Game</h3>
            <p>Create a new room, call numbers, and manage the game.</p>
          </div>

          <div
            className="action-card"
            onClick={() => setScreen('player')}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setScreen('player')}
          >
            <div className="action-card-icon">🎮</div>
            <h3>Join a Game</h3>
            <p>Enter a room code to join and play with your ticket.</p>
          </div>
        </div>

        <div style={{
          marginTop: '3rem',
          display: 'flex',
          gap: '2rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          animation: 'fadeInUp 0.8s ease-out 0.6s both',
        }}>
          {[
            { icon: '🎯', label: 'Early Five' },
            { icon: '⬆️', label: 'Top Line' },
            { icon: '➡️', label: 'Middle Line' },
            { icon: '⬇️', label: 'Bottom Line' },
            { icon: '🏠', label: 'Full House' },
          ].map(prize => (
            <div key={prize.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
            }}>
              <span>{prize.icon}</span>
              <span>{prize.label}</span>
            </div>
          ))}
        </div>

        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: connected ? 'var(--accent-success)' : 'var(--accent-danger)',
          }} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </div>
  );
}

export default App;
