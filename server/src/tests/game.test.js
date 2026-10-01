/**
 * Tambola Game Test Suite
 * 
 * Tests for:
 * - Random number generation without duplicates
 * - Valid ticket generation
 * - Early Five validation
 * - Top, Middle, and Bottom Line validation
 * - Full House validation
 * - Invalid/premature claims
 * - Duplicate winning claims
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { generateTicket, validateTicket, generateTickets, getColumnNumbers } = require('../ticketGenerator');
const { NumberCaller, createNumberSequence } = require('../numberCaller');
const { validateClaim, validateEarlyFive, validateLine, validateFullHouse, CLAIM_TYPES } = require('../claimValidator');
const { GameRoom, RoomManager, GAME_STATUS } = require('../gameRoom');

// ==================== NUMBER GENERATION TESTS ====================

describe('Number Generation', () => {
  it('should generate a sequence of exactly 90 numbers', () => {
    const seq = createNumberSequence();
    assert.equal(seq.length, 90);
  });

  it('should contain all numbers from 1 to 90', () => {
    const seq = createNumberSequence();
    const sorted = [...seq].sort((a, b) => a - b);
    const expected = Array.from({ length: 90 }, (_, i) => i + 1);
    assert.deepEqual(sorted, expected);
  });

  it('should have no duplicate numbers', () => {
    const seq = createNumberSequence();
    const unique = new Set(seq);
    assert.equal(unique.size, 90);
  });

  it('should generate different sequences on multiple calls', () => {
    const seq1 = createNumberSequence();
    const seq2 = createNumberSequence();
    // It's theoretically possible (but astronomically unlikely) for two shuffles to be identical
    const areDifferent = seq1.some((n, i) => n !== seq2[i]);
    assert.ok(areDifferent, 'Two sequences should be different');
  });

  it('NumberCaller should call all 90 numbers without repetition', () => {
    const caller = new NumberCaller();
    const called = [];

    for (let i = 0; i < 90; i++) {
      const result = caller.callNext();
      assert.ok(result !== null, `Should return a result for call ${i + 1}`);
      assert.ok(!called.includes(result.number), `Number ${result.number} should not be repeated`);
      called.push(result.number);
    }

    assert.equal(called.length, 90);
    assert.equal(new Set(called).size, 90);
  });

  it('NumberCaller should return null after all numbers are called', () => {
    const caller = new NumberCaller();
    for (let i = 0; i < 90; i++) {
      caller.callNext();
    }
    const result = caller.callNext();
    assert.equal(result, null);
  });

  it('NumberCaller should track remaining count correctly', () => {
    const caller = new NumberCaller();
    assert.equal(caller.getRemainingCount(), 90);

    caller.callNext();
    assert.equal(caller.getRemainingCount(), 89);

    for (let i = 0; i < 89; i++) {
      caller.callNext();
    }
    assert.equal(caller.getRemainingCount(), 0);
  });

  it('NumberCaller.isNumberCalled should work correctly', () => {
    const caller = new NumberCaller();
    const result = caller.callNext();
    
    assert.ok(caller.isNumberCalled(result.number));
    // Find a number not yet called
    const uncalled = Array.from({ length: 90 }, (_, i) => i + 1)
      .find(n => n !== result.number);
    assert.ok(!caller.isNumberCalled(uncalled));
  });

  it('NumberCaller reset should create a fresh sequence', () => {
    const caller = new NumberCaller();
    caller.callNext();
    caller.callNext();
    caller.callNext();
    
    assert.equal(caller.getCalledNumbers().length, 3);
    
    caller.reset();
    assert.equal(caller.getCalledNumbers().length, 0);
    assert.equal(caller.getRemainingCount(), 90);
  });
});

// ==================== TICKET GENERATION TESTS ====================

describe('Ticket Generation', () => {
  it('should generate a valid 3x9 ticket', () => {
    const ticket = generateTicket();
    assert.equal(ticket.length, 3);
    ticket.forEach(row => {
      assert.equal(row.length, 9);
    });
  });

  it('should have exactly 5 numbers per row', () => {
    for (let t = 0; t < 50; t++) {
      const ticket = generateTicket();
      ticket.forEach((row, i) => {
        const count = row.filter(n => n !== null).length;
        assert.equal(count, 5, `Row ${i} should have 5 numbers, got ${count}`);
      });
    }
  });

  it('should have exactly 15 numbers total', () => {
    for (let t = 0; t < 50; t++) {
      const ticket = generateTicket();
      const total = ticket.flat().filter(n => n !== null).length;
      assert.equal(total, 15);
    }
  });

  it('should have no duplicate numbers', () => {
    for (let t = 0; t < 50; t++) {
      const ticket = generateTicket();
      const numbers = ticket.flat().filter(n => n !== null);
      const unique = new Set(numbers);
      assert.equal(unique.size, numbers.length, 'Should have no duplicates');
    }
  });

  it('should have numbers in correct column ranges', () => {
    for (let t = 0; t < 50; t++) {
      const ticket = generateTicket();
      for (let col = 0; col < 9; col++) {
        const validRange = getColumnNumbers(col);
        for (let row = 0; row < 3; row++) {
          if (ticket[row][col] !== null) {
            assert.ok(
              validRange.includes(ticket[row][col]),
              `Number ${ticket[row][col]} at col ${col} is not in range [${validRange[0]}-${validRange[validRange.length - 1]}]`
            );
          }
        }
      }
    }
  });

  it('should have numbers in ascending order within each column', () => {
    for (let t = 0; t < 50; t++) {
      const ticket = generateTicket();
      for (let col = 0; col < 9; col++) {
        const colNumbers = [];
        for (let row = 0; row < 3; row++) {
          if (ticket[row][col] !== null) {
            colNumbers.push(ticket[row][col]);
          }
        }
        for (let i = 1; i < colNumbers.length; i++) {
          assert.ok(
            colNumbers[i] > colNumbers[i - 1],
            `Column ${col}: ${colNumbers[i]} should be > ${colNumbers[i - 1]}`
          );
        }
      }
    }
  });

  it('should have all numbers between 1 and 90', () => {
    for (let t = 0; t < 50; t++) {
      const ticket = generateTicket();
      const numbers = ticket.flat().filter(n => n !== null);
      numbers.forEach(n => {
        assert.ok(n >= 1 && n <= 90, `Number ${n} is out of range`);
      });
    }
  });

  it('validateTicket should pass for valid tickets', () => {
    for (let t = 0; t < 50; t++) {
      const ticket = generateTicket();
      const result = validateTicket(ticket);
      assert.ok(result.valid, `Ticket should be valid: ${result.errors.join(', ')}`);
    }
  });

  it('validateTicket should fail for invalid tickets', () => {
    // Wrong number of rows
    let result = validateTicket([[1, 2, 3]]);
    assert.ok(!result.valid);

    // Wrong number of columns
    result = validateTicket([[1, 2], [3, 4], [5, 6]]);
    assert.ok(!result.valid);
  });

  it('should generate multiple unique tickets', () => {
    const tickets = generateTickets(10);
    assert.equal(tickets.length, 10);

    // Check uniqueness
    const keys = tickets.map(t =>
      t.flat().filter(n => n !== null).sort((a, b) => a - b).join(',')
    );
    const unique = new Set(keys);
    assert.equal(unique.size, 10, 'All tickets should be unique');
  });
});

// ==================== CLAIM VALIDATION TESTS ====================

describe('Early Five Validation', () => {
  it('should validate a correct Early Five claim', () => {
    const ticket = [
      [3, null, 21, null, 45, null, null, 72, null],
      [null, 12, null, 36, null, 55, null, null, 88],
      [8, null, null, null, 48, null, 65, null, 82],
    ];
    const calledNumbers = [3, 21, 45, 72, 12, 36, 55];
    const markedNumbers = [3, 21, 45, 72, 12];

    const result = validateEarlyFive(ticket, calledNumbers, markedNumbers);
    assert.ok(result.valid);
  });

  it('should reject Early Five with fewer than 5 marks', () => {
    const ticket = [
      [3, null, 21, null, 45, null, null, 72, null],
      [null, 12, null, 36, null, 55, null, null, 88],
      [8, null, null, null, 48, null, 65, null, 82],
    ];
    const calledNumbers = [3, 21, 45, 72];
    const markedNumbers = [3, 21, 45, 72];

    const result = validateEarlyFive(ticket, calledNumbers, markedNumbers);
    assert.ok(!result.valid);
  });

  it('should reject Early Five with uncalled numbers marked', () => {
    const ticket = [
      [3, null, 21, null, 45, null, null, 72, null],
      [null, 12, null, 36, null, 55, null, null, 88],
      [8, null, null, null, 48, null, 65, null, 82],
    ];
    const calledNumbers = [3, 21, 45];
    const markedNumbers = [3, 21, 45, 72, 12]; // 72 and 12 not called

    const result = validateEarlyFive(ticket, calledNumbers, markedNumbers);
    assert.ok(!result.valid);
  });
});

describe('Line Validation', () => {
  const ticket = [
    [3, null, 21, null, 45, null, null, 72, null],   // Top: 3, 21, 45, 72, and need 5th
    [null, 12, null, 36, null, 55, null, null, 88],   // Middle: 12, 36, 55, 88, need 5th
    [8, null, null, null, 48, null, 65, null, 82],    // Bottom: 8, 48, 65, 82, need 5th
  ];

  // Let's fix the ticket to have exactly 5 per row
  const validTicket = [
    [3, null, 21, null, 45, 52, null, 72, null],     // Top: 3, 21, 45, 52, 72
    [null, 12, null, 36, null, null, 67, null, 88],   // Middle: 12, 36, 67, 88, need 5th
    [8, null, 28, null, 48, null, null, null, 82],    // Bottom: 8, 28, 48, 82, need 5th
  ];

  // Actually, let me make a proper valid ticket
  const testTicket = [
    [3, null, 21, null, 45, 52, null, 72, null],     // Top: 3, 21, 45, 52, 72
    [null, 12, null, 36, null, null, 67, null, 88],   // Middle: 12, 36, 67, 88 (4 nums - need 5)
    [8, null, 28, null, 48, null, null, 78, null],    // Bottom: 8, 28, 48, 78 (4 nums - need 5)
  ];

  // Let me create a properly valid ticket for testing
  const properTicket = [
    [3, null, 21, null, 45, 52, null, 72, null],     // Top: 5 numbers
    [null, 12, null, 36, null, 56, 67, null, null],   // Middle: 5 numbers
    [8, null, 28, null, 48, null, null, 78, 85],      // Bottom: 5 numbers
  ];

  it('should validate correct Top Line claim', () => {
    const calledNumbers = [3, 21, 45, 52, 72, 12, 36, 8];
    const markedNumbers = [3, 21, 45, 52, 72];

    const result = validateLine(properTicket, calledNumbers, markedNumbers, 0);
    assert.ok(result.valid);
  });

  it('should reject Top Line with uncalled numbers', () => {
    const calledNumbers = [3, 21, 45, 52]; // 72 not called
    const markedNumbers = [3, 21, 45, 52, 72];

    const result = validateLine(properTicket, calledNumbers, markedNumbers, 0);
    assert.ok(!result.valid);
  });

  it('should validate correct Middle Line claim', () => {
    const calledNumbers = [12, 36, 56, 67, 3, 21, 45];
    const markedNumbers = [12, 36, 56, 67];

    const result = validateLine(properTicket, calledNumbers, markedNumbers, 1);
    assert.ok(result.valid);
  });

  it('should reject Middle Line with unmarked numbers', () => {
    const calledNumbers = [12, 36, 56, 67];
    const markedNumbers = [12, 36, 56]; // 67 not marked

    const result = validateLine(properTicket, calledNumbers, markedNumbers, 1);
    assert.ok(!result.valid);
  });

  it('should validate correct Bottom Line claim', () => {
    const calledNumbers = [8, 28, 48, 78, 85, 3, 21];
    const markedNumbers = [8, 28, 48, 78, 85];

    const result = validateLine(properTicket, calledNumbers, markedNumbers, 2);
    assert.ok(result.valid);
  });

  it('should reject Bottom Line with uncalled numbers', () => {
    const calledNumbers = [8, 28, 48, 78]; // 85 not called
    const markedNumbers = [8, 28, 48, 78, 85];

    const result = validateLine(properTicket, calledNumbers, markedNumbers, 2);
    assert.ok(!result.valid);
  });
});

describe('Full House Validation', () => {
  const ticket = [
    [3, null, 21, null, 45, 52, null, 72, null],
    [null, 12, null, 36, null, 56, 67, null, null],
    [8, null, 28, null, 48, null, null, 78, 85],
  ];

  it('should validate correct Full House claim', () => {
    const allNumbers = ticket.flat().filter(n => n !== null);
    const calledNumbers = [...allNumbers, 1, 2, 10, 11]; // Include extras
    const markedNumbers = [...allNumbers];

    const result = validateFullHouse(ticket, calledNumbers, markedNumbers);
    assert.ok(result.valid);
  });

  it('should reject Full House with uncalled numbers', () => {
    const allNumbers = ticket.flat().filter(n => n !== null);
    const calledNumbers = allNumbers.slice(0, -1); // Missing last number
    const markedNumbers = [...allNumbers];

    const result = validateFullHouse(ticket, calledNumbers, markedNumbers);
    assert.ok(!result.valid);
  });

  it('should reject Full House with unmarked numbers', () => {
    const allNumbers = ticket.flat().filter(n => n !== null);
    const calledNumbers = [...allNumbers];
    const markedNumbers = allNumbers.slice(0, -1); // Missing last mark

    const result = validateFullHouse(ticket, calledNumbers, markedNumbers);
    assert.ok(!result.valid);
  });
});

// ==================== CLAIM SYSTEM TESTS ====================

describe('Claim System', () => {
  it('should reject invalid claim type', () => {
    const ticket = generateTicket();
    const result = validateClaim('invalid_type', ticket, [], [], {});
    assert.ok(!result.valid);
  });

  it('should reject claim for already-won category', () => {
    const ticket = [
      [3, null, 21, null, 45, 52, null, 72, null],
      [null, 12, null, 36, null, 56, 67, null, null],
      [8, null, 28, null, 48, null, null, 78, 85],
    ];
    const calledNumbers = [3, 21, 45, 52, 72];
    const markedNumbers = [3, 21, 45, 52, 72];
    const wonCategories = {
      [CLAIM_TYPES.TOP_LINE]: { playerName: 'Player A', playerId: 'abc' },
    };

    const result = validateClaim(CLAIM_TYPES.TOP_LINE, ticket, calledNumbers, markedNumbers, wonCategories);
    assert.ok(!result.valid);
    assert.ok(result.error.includes('already been won'));
  });

  it('should handle premature claims (numbers not called)', () => {
    const ticket = [
      [3, null, 21, null, 45, 52, null, 72, null],
      [null, 12, null, 36, null, 56, 67, null, null],
      [8, null, 28, null, 48, null, null, 78, 85],
    ];
    // Only called 3 numbers, trying to claim Early Five
    const calledNumbers = [3, 21, 45];
    const markedNumbers = [3, 21, 45, 52, 72]; // 52 and 72 not called

    const result = validateClaim(CLAIM_TYPES.EARLY_FIVE, ticket, calledNumbers, markedNumbers, {});
    assert.ok(!result.valid);
  });
});

// ==================== GAME ROOM TESTS ====================

describe('Game Room', () => {
  let room;

  beforeEach(() => {
    room = new GameRoom('host-socket-id');
  });

  it('should create a room with valid code', () => {
    assert.ok(room.code);
    assert.equal(room.code.length, 6);
    assert.equal(room.status, GAME_STATUS.WAITING);
  });

  it('should add players correctly', () => {
    const result = room.addPlayer('player-1', 'Alice');
    assert.ok(result.success);
    assert.equal(room.players.size, 1);
  });

  it('should reject duplicate player names', () => {
    room.addPlayer('player-1', 'Alice');
    const result = room.addPlayer('player-2', 'alice');
    assert.ok(!result.success);
    assert.ok(result.error.includes('already exists'));
  });

  it('should not allow joining after game starts', () => {
    room.addPlayer('player-1', 'Alice');
    room.startGame();
    const result = room.addPlayer('player-2', 'Bob');
    assert.ok(!result.success);
  });

  it('should start the game with players', () => {
    room.addPlayer('player-1', 'Alice');
    const result = room.startGame();
    assert.ok(result.success);
    assert.equal(room.status, GAME_STATUS.PLAYING);
  });

  it('should not start without players', () => {
    const result = room.startGame();
    assert.ok(!result.success);
  });

  it('should pause and resume the game', () => {
    room.addPlayer('player-1', 'Alice');
    room.startGame();

    const pauseResult = room.pauseGame();
    assert.ok(pauseResult.success);
    assert.equal(room.status, GAME_STATUS.PAUSED);

    const resumeResult = room.resumeGame();
    assert.ok(resumeResult.success);
    assert.equal(room.status, GAME_STATUS.PLAYING);
  });

  it('should call numbers and mark them', () => {
    room.addPlayer('player-1', 'Alice');
    room.startGame();

    const callResult = room.callNextNumber();
    assert.ok(callResult.success);

    const player = room.players.get('player-1');
    const calledNumber = callResult.result.number;
    const ticketNumbers = player.ticket.flat().filter(n => n !== null);

    // Try to mark a called number that's on the ticket
    if (ticketNumbers.includes(calledNumber)) {
      const markResult = room.markNumber('player-1', calledNumber);
      assert.ok(markResult.success);
    }
  });

  it('should prevent marking uncalled numbers', () => {
    room.addPlayer('player-1', 'Alice');
    room.startGame();

    const player = room.players.get('player-1');
    const ticketNumbers = player.ticket.flat().filter(n => n !== null);

    // Don't call any numbers - try to mark one
    const result = room.markNumber('player-1', ticketNumbers[0]);
    assert.ok(!result.success);
    assert.ok(result.error.includes('not been called'));
  });

  it('should allow unmarking numbers', () => {
    room.addPlayer('player-1', 'Alice');
    room.startGame();

    // Call numbers until we find one on the ticket
    const player = room.players.get('player-1');
    const ticketNumbers = player.ticket.flat().filter(n => n !== null);
    
    let markedNumber = null;
    for (let i = 0; i < 90 && !markedNumber; i++) {
      const callResult = room.callNextNumber();
      if (callResult.success && ticketNumbers.includes(callResult.result.number)) {
        room.markNumber('player-1', callResult.result.number);
        markedNumber = callResult.result.number;
      }
    }

    if (markedNumber) {
      const unmarkResult = room.unmarkNumber('player-1', markedNumber);
      assert.ok(unmarkResult.success);
      assert.ok(!player.markedNumbers.includes(markedNumber));
    }
  });

  it('should reset the game correctly', () => {
    room.addPlayer('player-1', 'Alice');
    room.startGame();
    room.callNextNumber();
    room.callNextNumber();

    room.resetGame();

    assert.equal(room.status, GAME_STATUS.WAITING);
    assert.equal(room.numberCaller.getCalledNumbers().length, 0);
    assert.deepEqual(room.wonCategories, {});
    assert.equal(room.claims.length, 0);
  });
});

// ==================== DUPLICATE WINNER TESTS ====================

describe('Duplicate Winner Prevention', () => {
  it('should prevent duplicate winners for the same category', () => {
    const room = new GameRoom('host');
    room.addPlayer('player-1', 'Alice');
    room.addPlayer('player-2', 'Bob');
    room.startGame();

    // Call lots of numbers
    for (let i = 0; i < 30; i++) {
      room.callNextNumber();
    }

    const calledNumbers = room.numberCaller.getCalledNumbers();
    const player1 = room.players.get('player-1');
    const player2 = room.players.get('player-2');

    // Mark called numbers for both players
    const p1Numbers = player1.ticket.flat().filter(n => n !== null);
    const p2Numbers = player2.ticket.flat().filter(n => n !== null);

    p1Numbers.forEach(n => {
      if (calledNumbers.includes(n)) {
        room.markNumber('player-1', n);
      }
    });

    p2Numbers.forEach(n => {
      if (calledNumbers.includes(n)) {
        room.markNumber('player-2', n);
      }
    });

    // Player 1 submits Early Five
    if (player1.markedNumbers.length >= 5) {
      const claim1 = room.submitClaim('player-1', CLAIM_TYPES.EARLY_FIVE);
      
      if (claim1.success) {
        // Approve it
        room.approveClaim(claim1.claim.id);

        // Player 2 tries to claim the same category
        if (player2.markedNumbers.length >= 5) {
          const claim2 = room.submitClaim('player-2', CLAIM_TYPES.EARLY_FIVE);
          assert.ok(!claim2.success, 'Second claim for same category should fail');
          assert.ok(claim2.error.includes('already been won'));
        }
      }
    }
  });
});

// ==================== ROOM MANAGER TESTS ====================

describe('Room Manager', () => {
  let manager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('should create rooms with unique codes', () => {
    const room1 = manager.createRoom('host-1');
    const room2 = manager.createRoom('host-2');
    assert.notEqual(room1.code, room2.code);
  });

  it('should find rooms by code', () => {
    const room = manager.createRoom('host-1');
    const found = manager.getRoom(room.code);
    assert.ok(found);
    assert.equal(found.code, room.code);
  });

  it('should find rooms by socket ID', () => {
    const room = manager.createRoom('host-1');
    const found = manager.getRoomForSocket('host-1');
    assert.ok(found);
    assert.equal(found.code, room.code);
  });

  it('should handle player joining', () => {
    const room = manager.createRoom('host-1');
    const result = manager.joinRoom('player-1', room.code, 'Alice');
    assert.ok(result.success);
  });

  it('should handle invalid room code', () => {
    const result = manager.joinRoom('player-1', 'INVALID', 'Alice');
    assert.ok(!result.success);
    assert.ok(result.error.includes('not found'));
  });

  it('should handle disconnection', () => {
    const room = manager.createRoom('host-1');
    manager.joinRoom('player-1', room.code, 'Alice');

    const result = manager.handleDisconnect('player-1');
    assert.ok(!result.wasHost);
    assert.equal(result.playerName, 'Alice');
  });

  it('should handle host disconnection', () => {
    manager.createRoom('host-1');
    const result = manager.handleDisconnect('host-1');
    assert.ok(result.wasHost);
  });
});

console.log('Running Tambola test suite...');
