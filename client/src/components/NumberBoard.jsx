/**
 * Number Board Component
 * 
 * Displays all 90 numbers in a 9x10 grid.
 * Called numbers are highlighted, uncalled remain dim.
 */
export default function NumberBoard({ calledNumbers = [], lastCalled = null }) {
  const calledSet = new Set(calledNumbers);

  return (
    <div className="number-board">
      <div className="number-board-title">Number Board</div>
      <div className="number-grid">
        {Array.from({ length: 90 }, (_, i) => i + 1).map(num => {
          const isCalled = calledSet.has(num);
          const isJustCalled = num === lastCalled;

          return (
            <div
              key={num}
              className={`number-cell ${isCalled ? 'called' : 'uncalled'} ${isJustCalled ? 'just-called' : ''}`}
            >
              {num}
            </div>
          );
        })}
      </div>
    </div>
  );
}
