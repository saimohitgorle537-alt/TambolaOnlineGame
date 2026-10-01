/**
 * Current Number Display Component
 * 
 * Shows the most recently called number prominently,
 * calling mode banner (Manual vs Automatic with countdown timer),
 * and stats (called count, remaining count).
 */
export default function CurrentNumber({
  lastCalled,
  totalCalled = 0,
  remaining = 90,
  callingMode = 'manual',
  autoCallingState = 'stopped',
  timerRemaining = 10,
  interval = 10,
}) {
  const isAuto = callingMode === 'automatic';
  const progressPercent = interval > 0 ? Math.max(0, Math.min(100, (timerRemaining / interval) * 100)) : 0;

  return (
    <div className="current-number-display">
      {/* Calling Mode & Timer Banner */}
      <div className="calling-mode-banner">
        {!isAuto ? (
          <div className="calling-mode-badge manual">
            <span className="mode-icon">✋</span>
            <span className="mode-title">MANUAL CALLING</span>
          </div>
        ) : (
          <div className={`calling-mode-badge auto ${autoCallingState}`}>
            <span className="mode-icon">
              {autoCallingState === 'running' ? '⚡' : autoCallingState === 'paused' ? '⏸' : '⏹'}
            </span>
            <div className="mode-text-group">
              <span className="mode-title">
                {autoCallingState === 'running'
                  ? 'AUTO CALLING ACTIVE'
                  : autoCallingState === 'paused'
                  ? 'AUTO CALLING PAUSED'
                  : 'AUTO CALLING STOPPED'}
              </span>
              {autoCallingState === 'running' && (
                <span className="mode-countdown">
                  Next number in: <strong>{String(timerRemaining).padStart(2, '0')}s</strong>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Auto-Calling Progress Bar */}
      {isAuto && autoCallingState === 'running' && (
        <div className="timer-progress-track">
          <div
            className="timer-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="current-number-label">Current Number</div>
      <div
        className={`current-number ${!lastCalled ? 'no-number' : 'number-pop'}`}
        key={lastCalled || 'none'}
      >
        {lastCalled || '—'}
      </div>

      <div className="number-stats">
        <div className="number-stat">
          <div className="number-stat-value">{totalCalled}</div>
          <div className="number-stat-label">Called</div>
        </div>
        <div className="number-stat">
          <div className="number-stat-value">{remaining}</div>
          <div className="number-stat-label">Remaining</div>
        </div>
      </div>
    </div>
  );
}
