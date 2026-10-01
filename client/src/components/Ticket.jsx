import { useState } from 'react';

/**
 * Ticket Component
 * 
 * Renders a 3×9 Tambola ticket with interactive marking.
 * Supports multiple tickets per player with intuitive tabs.
 * - Empty cells are dimmed
 * - Callable numbers (called but not marked) glow
 * - Marked numbers show green with checkmark
 */
export default function Ticket({
  ticket,
  tickets = null,
  markedNumbers = [],
  calledNumbers = [],
  onMark,
  onUnmark,
  disabled = false,
  showTitle = true,
  playerName = '',
}) {
  const [activeTicketIndex, setActiveTicketIndex] = useState(0);

  const ticketList = tickets && tickets.length > 0 ? tickets : (ticket ? [ticket] : []);
  if (ticketList.length === 0) return null;

  const currentTicket = ticketList[activeTicketIndex] || ticketList[0];
  const calledSet = new Set(calledNumbers);
  const markedSet = new Set(markedNumbers);

  const handleCellClick = (num) => {
    if (disabled || num === null) return;

    if (markedSet.has(num)) {
      onUnmark?.(num);
    } else if (calledSet.has(num)) {
      onMark?.(num);
    }
  };

  const getTicketMarkedCount = (t) => {
    const nums = t.flat().filter(n => n !== null);
    return nums.filter(n => markedSet.has(n)).length;
  };

  return (
    <div className="ticket-container">
      {/* Title & Ticket Switcher */}
      <div className="ticket-header-row">
        {showTitle && (
          <div className="ticket-title">
            {playerName ? `${playerName}'s Ticket` : 'Your Ticket'}
          </div>
        )}

        {ticketList.length > 1 && (
          <div className="ticket-tabs">
            {ticketList.map((t, idx) => {
              const markedCount = getTicketMarkedCount(t);
              return (
                <button
                  key={idx}
                  type="button"
                  className={`ticket-tab ${activeTicketIndex === idx ? 'active' : ''}`}
                  onClick={() => setActiveTicketIndex(idx)}
                >
                  Ticket {idx + 1}
                  <span className="tab-count-badge">({markedCount}/15)</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="ticket-grid">
        {currentTicket.flat().map((num, idx) => {
          if (num === null) {
            return <div key={idx} className="ticket-cell empty" />;
          }

          const isCalled = calledSet.has(num);
          const isMarked = markedSet.has(num);
          const isCallable = isCalled && !isMarked;

          let cellClass = 'ticket-cell';
          if (isMarked) {
            cellClass += ' marked';
          } else if (isCallable) {
            cellClass += ' unmarked callable';
          } else {
            cellClass += ' unmarked';
          }

          return (
            <div
              key={idx}
              className={cellClass}
              onClick={() => handleCellClick(num)}
              title={
                isMarked
                  ? 'Click to unmark'
                  : isCalled
                  ? 'Click to mark'
                  : 'Not called yet'
              }
            >
              {num}
            </div>
          );
        })}
      </div>
    </div>
  );
}
