/**
 * Unit & Integration Tests for Manual and Automatic Number Calling
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { GameRoom, GAME_STATUS } = require('../gameRoom');
const { CLAIM_TYPES } = require('../claimValidator');

describe('Host Number Calling Modes & Settings', () => {
  let room;

  beforeEach(() => {
    room = new GameRoom('host-socket-1');
  });

  afterEach(() => {
    room.stopAutoCalling();
  });

  it('should default to manual mode with 10s interval and 1 ticket per player', () => {
    assert.strictEqual(room.settings.callingMode, 'manual');
    assert.strictEqual(room.settings.callingInterval, 10);
    assert.strictEqual(room.settings.maxTicketsPerPlayer, 1);
    assert.strictEqual(room.autoCallingState, 'stopped');
  });

  it('should allow initializing with custom settings', () => {
    const customRoom = new GameRoom('host-custom', {
      callingMode: 'automatic',
      callingInterval: 5,
      maxTicketsPerPlayer: 3,
      categorySettings: {
        [CLAIM_TYPES.TOP_LINE]: { enabled: true, maxWinners: 2 },
      },
    });
    assert.strictEqual(customRoom.settings.callingMode, 'automatic');
    assert.strictEqual(customRoom.settings.callingInterval, 5);
    assert.strictEqual(customRoom.settings.maxTicketsPerPlayer, 3);
    assert.strictEqual(customRoom.settings.categorySettings[CLAIM_TYPES.TOP_LINE].maxWinners, 2);
    customRoom.stopAutoCalling();
  });

  it('should update settings in waiting room', () => {
    const res = room.updateSettings({
      callingMode: 'automatic',
      callingInterval: 15,
      maxTicketsPerPlayer: 2,
      categorySettings: {
        [CLAIM_TYPES.MIDDLE_LINE]: { enabled: false, maxWinners: 1 },
        [CLAIM_TYPES.FULL_HOUSE]: { enabled: true, maxWinners: 3 },
      },
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(room.settings.callingMode, 'automatic');
    assert.strictEqual(room.settings.callingInterval, 15);
    assert.strictEqual(room.settings.maxTicketsPerPlayer, 2);
    assert.strictEqual(room.settings.categorySettings[CLAIM_TYPES.MIDDLE_LINE].enabled, false);
    assert.strictEqual(room.settings.categorySettings[CLAIM_TYPES.FULL_HOUSE].maxWinners, 3);
  });

  it('should generate multiple tickets when configured for maxTicketsPerPlayer > 1', () => {
    room.updateSettings({ maxTicketsPerPlayer: 3 });
    const joinRes = room.addPlayer('player-1', 'Alice');
    assert.strictEqual(joinRes.success, true);
    assert.strictEqual(joinRes.player.tickets.length, 3);
    assert.strictEqual(joinRes.player.ticket, joinRes.player.tickets[0]);
  });
});

describe('Manual Number Calling Mode', () => {
  let room;

  beforeEach(() => {
    room = new GameRoom('host-socket-1');
    room.addPlayer('p1', 'Player 1');
    room.startGame();
  });

  afterEach(() => {
    room.stopAutoCalling();
  });

  it('should allow host to call next number manually', () => {
    const res = room.callNextNumber(true);
    assert.strictEqual(res.success, true);
    assert.ok(res.result.number >= 1 && res.result.number <= 90);
    assert.strictEqual(res.result.totalCalled, 1);
    assert.strictEqual(res.result.remaining, 89);
  });

  it('should never call duplicate numbers', () => {
    const calledSet = new Set();
    for (let i = 0; i < 90; i++) {
      const res = room.callNextNumber(true);
      assert.strictEqual(res.success, true);
      assert.ok(!calledSet.has(res.result.number), `Number ${res.result.number} was called twice`);
      calledSet.add(res.result.number);
    }
    assert.strictEqual(calledSet.size, 90);

    // 91st call should return finished
    const overCall = room.callNextNumber(true);
    assert.strictEqual(overCall.success, false);
    assert.strictEqual(room.status, GAME_STATUS.FINISHED);
  });

  it('should update called-number history and state', () => {
    const res = room.callNextNumber(true);
    const state = room.getState();
    assert.strictEqual(state.numberCaller.calledNumbers.length, 1);
    assert.strictEqual(state.numberCaller.lastCalled, res.result.number);
    assert.strictEqual(state.numberCaller.totalCalled, 1);
    assert.strictEqual(state.numberCaller.remaining, 89);
  });
});

describe('Automatic Number Calling Mode', () => {
  let room;

  beforeEach(() => {
    room = new GameRoom('host-socket-1', {
      callingMode: 'automatic',
      callingInterval: 3,
    });
    room.addPlayer('p1', 'Player 1');
    room.startGame();
  });

  afterEach(() => {
    room.stopAutoCalling();
  });

  it('should not allow manual calling while automatic calling is active', () => {
    const startRes = room.startAutoCalling();
    assert.strictEqual(startRes.success, true);
    assert.strictEqual(room.autoCallingState, 'running');

    // Attempt manual call
    const manualCall = room.callNextNumber(true);
    assert.strictEqual(manualCall.success, false);
    assert.ok(manualCall.error.includes('automatic calling is active'));
  });

  it('should support starting, pausing, resuming, and stopping auto-calling', () => {
    // Start
    const startRes = room.startAutoCalling();
    assert.strictEqual(startRes.success, true);
    assert.strictEqual(room.autoCallingState, 'running');

    // Pause
    const pauseRes = room.pauseAutoCalling();
    assert.strictEqual(pauseRes.success, true);
    assert.strictEqual(room.autoCallingState, 'paused');

    // Resume
    const resumeRes = room.resumeAutoCalling();
    assert.strictEqual(resumeRes.success, true);
    assert.strictEqual(room.autoCallingState, 'running');

    // Stop
    const stopRes = room.stopAutoCalling();
    assert.strictEqual(stopRes.success, true);
    assert.strictEqual(room.autoCallingState, 'stopped');
    assert.strictEqual(room.timerRemaining, 3);
  });

  it('should safely switch between modes preserving called numbers', () => {
    // Call 5 numbers
    room.setCallingMode('manual');
    for (let i = 0; i < 5; i++) {
      room.callNextNumber(true);
    }
    assert.strictEqual(room.numberCaller.getCalledNumbers().length, 5);

    // Switch to automatic mode
    const switchRes = room.setCallingMode('automatic', 5);
    assert.strictEqual(switchRes.success, true);
    assert.strictEqual(room.settings.callingMode, 'automatic');
    assert.strictEqual(room.settings.callingInterval, 5);
    // Preserves history
    assert.strictEqual(room.numberCaller.getCalledNumbers().length, 5);
    assert.strictEqual(room.numberCaller.getRemainingCount(), 85);

    // Switch back to manual mode
    const switchBack = room.setCallingMode('manual');
    assert.strictEqual(switchBack.success, true);
    assert.strictEqual(room.settings.callingMode, 'manual');
    assert.strictEqual(room.numberCaller.getCalledNumbers().length, 5);
  });

  it('should automatically stop auto-calling when all numbers are exhausted', () => {
    // Call 89 numbers directly
    for (let i = 0; i < 89; i++) {
      room.numberCaller.callNext();
    }
    assert.strictEqual(room.numberCaller.getRemainingCount(), 1);

    room.startAutoCalling();
    // Call last number
    const lastCall = room.callNextNumber(false);
    assert.strictEqual(lastCall.success, true);
    assert.strictEqual(room.numberCaller.getRemainingCount(), 0);
    assert.strictEqual(room.numberCaller.isComplete(), true);
  });
});

describe('Winning Categories & Multi-Winners', () => {
  let room;

  beforeEach(() => {
    room = new GameRoom('host-1', {
      categorySettings: {
        [CLAIM_TYPES.TOP_LINE]: { enabled: true, maxWinners: 2 },
        [CLAIM_TYPES.MIDDLE_LINE]: { enabled: false, maxWinners: 1 },
      },
    });
    room.addPlayer('p1', 'Alice');
    room.addPlayer('p2', 'Bob');
    room.addPlayer('p3', 'Charlie');
    room.startGame();
  });

  afterEach(() => {
    room.stopAutoCalling();
  });

  it('should reject claim for disabled category', () => {
    const claimRes = room.submitClaim('p1', CLAIM_TYPES.MIDDLE_LINE);
    assert.strictEqual(claimRes.success, false);
    assert.ok(claimRes.error.includes('disabled'));
  });

  it('should allow multiple winners up to maxWinners', () => {
    const p1 = room.players.get('p1');
    const p2 = room.players.get('p2');

    // Force p1 and p2 to have valid top line marked
    const topRowP1 = p1.ticket[0].filter(n => n !== null);
    const topRowP2 = p2.ticket[0].filter(n => n !== null);

    // Call all numbers needed
    const allNums = [...new Set([...topRowP1, ...topRowP2])];
    allNums.forEach(n => {
      room.numberCaller.calledNumbers.push(n);
    });

    topRowP1.forEach(n => room.markNumber('p1', n));
    topRowP2.forEach(n => room.markNumber('p2', n));

    // Player 1 claims Top Line
    const claim1 = room.submitClaim('p1', CLAIM_TYPES.TOP_LINE);
    assert.strictEqual(claim1.success, true);
    room.approveClaim(claim1.claim.id);

    // Verify 1 winner recorded
    assert.strictEqual(room.categoryWinners[CLAIM_TYPES.TOP_LINE].length, 1);

    // Player 2 also claims Top Line (allowed since maxWinners is 2)
    const claim2 = room.submitClaim('p2', CLAIM_TYPES.TOP_LINE);
    assert.strictEqual(claim2.success, true);
    room.approveClaim(claim2.claim.id);

    // Verify 2 winners recorded
    assert.strictEqual(room.categoryWinners[CLAIM_TYPES.TOP_LINE].length, 2);

    // Player 3 tries to claim Top Line (should fail since max is 2)
    const claim3 = room.submitClaim('p3', CLAIM_TYPES.TOP_LINE);
    assert.strictEqual(claim3.success, false);
    assert.ok(claim3.error.includes('maximum winners'));
  });

  it('should prevent the same player from winning the same category twice', () => {
    const p1 = room.players.get('p1');
    const topRow = p1.ticket[0].filter(n => n !== null);
    topRow.forEach(n => {
      room.numberCaller.calledNumbers.push(n);
      room.markNumber('p1', n);
    });

    const claim1 = room.submitClaim('p1', CLAIM_TYPES.TOP_LINE);
    assert.strictEqual(claim1.success, true);
    room.approveClaim(claim1.claim.id);

    // Alice tries to claim again
    const claimDuplicate = room.submitClaim('p1', CLAIM_TYPES.TOP_LINE);
    assert.strictEqual(claimDuplicate.success, false);
    assert.ok(claimDuplicate.error.includes('already won'));
  });
});
