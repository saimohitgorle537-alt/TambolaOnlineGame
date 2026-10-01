# 🎲 Tambola (Housie) — Multiplayer Online Game

A complete real-time multiplayer Tambola/Housie game built with **React**, **Node.js**, **Express**, and **Socket.IO**.

---

## ✨ Features

### 🎛️ Flexible Number Calling System
- **Manual Calling Mode**: The host controls when each number is called using the `[ CALL NEXT NUMBER ]` button.
- **Automatic Calling Mode**: Numbers are called automatically at a host-configured interval with live synchronized countdown timer.
- **Configurable Timer**: Presets for 3s, 5s, 10s, 15s, 20s, 30s, 60s, or custom interval.
- **Auto-Calling Controls**: Start, Pause, Resume, and Stop controls without resetting the game state.
- **Mode Safety**: Conflicting manual actions are prevented while auto-calling is active.
- **Safe Mode Switching**: Switch between Manual and Automatic modes anytime without duplicate numbers or losing game progress.
- **No Duplicate Numbers**: All 90 numbers are called randomly without repetition; auto-calling stops automatically when all numbers are exhausted.

### ⚙️ Host Game Settings
- **Maximum Tickets Per Player**: 1, 2, or 3 tickets per player.
- **Winning Categories Configuration**: Enable or disable specific winning categories and configure maximum winners per category:
  - First Line (Top Line) — Enabled / Disabled, Maximum Winners (1–5)
  - Middle Line — Enabled / Disabled, Maximum Winners (1–5)
  - Bottom Line — Enabled / Disabled, Maximum Winners (1–5)
  - Full House — Enabled / Disabled, Maximum Winners (1–5)
  - Early Five — Enabled / Disabled, Maximum Winners (1–5)

### 👥 Player Experience
- **Real-Time Synchronization**: Live server-authoritative timer countdown, called number announcements, and board updates.
- **Multi-Ticket Support**: Tabbed navigation between multiple tickets with marked count indicators.
- **Interactive Ticket**: Tap to mark called numbers; prevents marking uncalled numbers.
- **Audio & Voice Announcements**: Web Audio chimes plus browser speech synthesis for voice number announcements, with mute/unmute toggle.
- **Prize Claiming**: Claim prizes in real-time with server-side validation and host approval.

---

## 🏗️ Architecture

```
tambola/
├── server/                 # Node.js + Express + Socket.IO backend
│   ├── src/
│   │   ├── index.js           # Server entry point & Socket.IO event handlers
│   │   ├── gameRoom.js        # GameRoom state, timer, and settings management
│   │   ├── ticketGenerator.js # Standards-compliant ticket generation (3×9, 5/row)
│   │   ├── numberCaller.js    # Pre-shuffled 1-90 number sequence
│   │   ├── claimValidator.js  # Server-side validation with category & winner limits
│   │   └── tests/
│   │       ├── game.test.js              # Core game unit tests (53 tests)
│   │       ├── numberCallingModes.test.js # Manual/Auto calling & settings tests (14 tests)
│   │       └── e2eSocketFlow.test.js     # Real-time WebSocket E2E integration test
│   ├── .env                   # Environment variables
│   └── package.json
│
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx            # Landing page & view routing
│   │   ├── socket.js          # Socket.IO client instance
│   │   ├── index.css          # Design system & responsive styles
│   │   ├── pages/
│   │   │   ├── HostScreen.jsx    # Host control panel with manual/auto modes & settings
│   │   │   └── PlayerScreen.jsx  # Player screen with live auto-calling sync & tickets
│   │   └── components/
│   │       ├── Ticket.jsx        # Interactive ticket with multi-ticket tabs
│   │       ├── NumberBoard.jsx   # 1-90 number grid
│   │       ├── CurrentNumber.jsx # Current number display & live countdown timer
│   │       ├── PrizeTracker.jsx  # Multi-winner prize tracker
│   │       ├── PlayersList.jsx   # Connected players list
│   │       └── SoundEffects.jsx  # Web Audio, voice announcements, confetti
│   ├── index.html
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+
- **npm** v9+

### 1. Install Dependencies

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

### 2. Start the Server

```bash
cd server
npm run dev
```

The server starts on `http://localhost:3001`.

### 3. Start the Client

```bash
cd client
npm run dev
```

The client starts on `http://localhost:5173`.

### 4. Run Test Suite

```bash
cd server
npm test
```

Runs all 68 tests covering ticket generation, number calling, manual & automatic modes, configurable timers, category winners, and WebSocket E2E lifecycle.

---

## 📖 Game Rules & Categories

1. Numbers from **1 to 90** are called one at a time.
2. Every player receives a standard Tambola ticket:
   - 3 rows × 9 columns
   - Exactly 5 numbers per row (15 total numbers)
   - Numbers sorted in ascending order within each column
3. Callable numbers can be marked by clicking them on the ticket.
4. **Winning Categories**:
   - **Early Five**: First player to mark any 5 numbers.
   - **First Line**: First player to mark all 5 numbers in the top row.
   - **Middle Line**: First player to mark all 5 numbers in the middle row.
   - **Bottom Line**: First player to mark all 5 numbers in the bottom row.
   - **Full House**: First player to mark all 15 numbers on a ticket.
