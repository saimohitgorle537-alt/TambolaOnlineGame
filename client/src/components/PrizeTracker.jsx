/**
 * Prize Tracker Component
 * 
 * Shows all winning categories with their status,
 * supporting configurable categories, multiple winners,
 * and player claim actions.
 */

const PRIZES = [
  { type: 'early_five', name: 'Early Five', icon: '🎯', description: 'Any 5 numbers' },
  { type: 'top_line', name: 'First Line', icon: '⬆️', description: 'All numbers in row 1' },
  { type: 'middle_line', name: 'Middle Line', icon: '➡️', description: 'All numbers in row 2' },
  { type: 'bottom_line', name: 'Bottom Line', icon: '⬇️', description: 'All numbers in row 3' },
  { type: 'full_house', name: 'Full House', icon: '🏠', description: 'All 15 numbers' },
];

export default function PrizeTracker({
  wonCategories = {},
  categoryWinners = {},
  categorySettings = {},
  onClaim,
  isPlayer = false,
  myPlayerId = null,
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">🏆 Prizes</span>
      </div>
      <div className="panel-body">
        <div className="prize-list">
          {PRIZES.map(prize => {
            const config = categorySettings[prize.type] || { enabled: true, maxWinners: 1 };
            if (config.enabled === false) return null;

            // Collect winners list
            const winnersList = categoryWinners[prize.type] ||
              (wonCategories[prize.type] ? [wonCategories[prize.type]] : []);
            const maxWinners = config.maxWinners || 1;
            const isFull = winnersList.length >= maxWinners;
            const hasMyWin = myPlayerId ? winnersList.some(w => w.playerId === myPlayerId) : false;
            const canClaim = isPlayer && onClaim && !isFull && !hasMyWin;

            return (
              <div
                key={prize.type}
                className={`prize-item ${isFull ? 'won' : ''} ${canClaim ? 'claimable' : ''}`}
                onClick={() => {
                  if (canClaim) {
                    onClaim(prize.type);
                  }
                }}
                title={
                  isFull
                    ? `Won by ${winnersList.map(w => w.playerName).join(', ')}`
                    : prize.description
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="prize-name">
                    <span className="prize-icon">{prize.icon}</span>
                    {prize.name}
                  </span>
                  {maxWinners > 1 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      ({winnersList.length}/{maxWinners})
                    </span>
                  )}
                </div>

                {winnersList.length > 0 ? (
                  <span className="prize-winner" style={{ fontSize: '0.8rem', textAlign: 'right' }}>
                    🎉 {winnersList.map(w => w.playerName).join(', ')}
                  </span>
                ) : canClaim ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary-light)', fontWeight: 600 }}>
                    Tap to claim
                  </span>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Open
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
