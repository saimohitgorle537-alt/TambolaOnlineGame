/**
 * Players List Component
 * 
 * Shows all connected players with their marked count.
 */
export default function PlayersList({ players = [] }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">👥 Players</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {players.length} joined
        </span>
      </div>
      <div className="panel-body">
        {players.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem', fontSize: '0.85rem' }}>
            Waiting for players to join...
          </div>
        ) : (
          players.map((player, idx) => (
            <div key={player.id || idx} className="player-item">
              <div className="player-info">
                <div className="player-avatar">
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="player-name">{player.name}</div>
                  <div className="player-marks">{player.markedCount || 0} marked</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
