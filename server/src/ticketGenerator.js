/**
 * Tambola Ticket Generator
 * 
 * Generates valid Tambola/Housie tickets following standard rules:
 * - 3 rows × 9 columns
 * - 15 numbers total (5 per row)
 * - Column 1: 1-9, Column 2: 10-19, ..., Column 9: 80-90
 * - Numbers in each column sorted ascending
 * - No duplicate numbers
 */

/**
 * Shuffles an array in-place using Fisher-Yates algorithm
 * @param {Array} arr 
 * @returns {Array}
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Get the column ranges for Tambola
 * Column 0: 1-9 (9 numbers)
 * Column 1: 10-19 (10 numbers)
 * ...
 * Column 7: 70-79 (10 numbers)
 * Column 8: 80-90 (11 numbers)
 */
function getColumnNumbers(col) {
  if (col === 0) {
    return Array.from({ length: 9 }, (_, i) => i + 1);     // 1-9
  } else if (col === 8) {
    return Array.from({ length: 11 }, (_, i) => i + 80);   // 80-90
  } else {
    return Array.from({ length: 10 }, (_, i) => i + col * 10); // 10-19, 20-29, etc.
  }
}

/**
 * Generate a single valid Tambola ticket
 * @returns {Array<Array<number|null>>} 3×9 grid, null for empty cells
 */
function generateTicket() {
  // We need exactly 5 numbers per row, 15 total, across 9 columns
  // Each column must have at least 0 and at most 3 numbers
  // We need to pick which columns have numbers in which rows

  let ticket = null;
  let attempts = 0;
  const maxAttempts = 1000;

  while (!ticket && attempts < maxAttempts) {
    attempts++;
    ticket = tryGenerateTicket();
  }

  if (!ticket) {
    throw new Error('Failed to generate a valid ticket after maximum attempts');
  }

  return ticket;
}

function tryGenerateTicket() {
  // Step 1: For each column, pick how many numbers (1, 2, or 3)
  // Total must be 15, and each row must have exactly 5 numbers
  
  // Create a 3x9 grid to track which cells have numbers
  const grid = Array.from({ length: 3 }, () => Array(9).fill(false));
  
  // We need each row to have exactly 5 filled cells
  // Approach: Distribute numbers column by column, ensuring row constraints
  
  // Each column must have 1-3 numbers, total = 15
  // Start by giving each column 1 number (9 columns = 9), then distribute 6 more
  const colCounts = Array(9).fill(1); // Start with 1 per column = 9
  
  // Distribute 6 more numbers across columns (max 3 per column)
  let remaining = 6;
  const availableCols = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  let idx = 0;
  
  while (remaining > 0) {
    const col = availableCols[idx % 9];
    if (colCounts[col] < 3) {
      colCounts[col]++;
      remaining--;
    }
    idx++;
    if (idx > 100) return null; // Safety
  }
  
  // Step 2: Assign rows for each column's numbers
  // We must end up with exactly 5 numbers per row
  const rowCounts = [0, 0, 0];
  
  for (let col = 0; col < 9; col++) {
    const count = colCounts[col];
    if (count === 3) {
      // All three rows
      grid[0][col] = true;
      grid[1][col] = true;
      grid[2][col] = true;
      rowCounts[0]++;
      rowCounts[1]++;
      rowCounts[2]++;
    } else if (count === 2) {
      // Pick 2 rows
      const rows = shuffle([0, 1, 2]).slice(0, 2).sort();
      rows.forEach(r => {
        grid[r][col] = true;
        rowCounts[r]++;
      });
    } else {
      // Pick 1 row
      const row = shuffle([0, 1, 2])[0];
      grid[row][col] = true;
      rowCounts[row]++;
    }
  }
  
  // Check if each row has exactly 5
  if (rowCounts[0] !== 5 || rowCounts[1] !== 5 || rowCounts[2] !== 5) {
    return null; // Try again
  }
  
  // Step 3: Fill in the actual numbers
  const ticket = Array.from({ length: 3 }, () => Array(9).fill(null));
  
  for (let col = 0; col < 9; col++) {
    const availableNumbers = shuffle(getColumnNumbers(col));
    const rowsWithNumbers = [];
    
    for (let row = 0; row < 3; row++) {
      if (grid[row][col]) {
        rowsWithNumbers.push(row);
      }
    }
    
    // Pick numbers and sort them for ascending order in column
    const pickedNumbers = availableNumbers.slice(0, rowsWithNumbers.length).sort((a, b) => a - b);
    
    rowsWithNumbers.forEach((row, i) => {
      ticket[row][col] = pickedNumbers[i];
    });
  }
  
  return ticket;
}

/**
 * Validate a ticket meets all Tambola rules
 * @param {Array<Array<number|null>>} ticket 
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTicket(ticket) {
  const errors = [];
  
  if (!ticket || ticket.length !== 3) {
    errors.push('Ticket must have exactly 3 rows');
    return { valid: false, errors };
  }
  
  for (let row = 0; row < 3; row++) {
    if (ticket[row].length !== 9) {
      errors.push(`Row ${row} must have exactly 9 columns`);
    }
  }
  
  if (errors.length > 0) return { valid: false, errors };
  
  // Check 5 numbers per row
  for (let row = 0; row < 3; row++) {
    const count = ticket[row].filter(n => n !== null).length;
    if (count !== 5) {
      errors.push(`Row ${row} has ${count} numbers, expected 5`);
    }
  }
  
  // Check total = 15
  const allNumbers = ticket.flat().filter(n => n !== null);
  if (allNumbers.length !== 15) {
    errors.push(`Ticket has ${allNumbers.length} numbers, expected 15`);
  }
  
  // Check no duplicates
  const uniqueNumbers = new Set(allNumbers);
  if (uniqueNumbers.size !== allNumbers.length) {
    errors.push('Ticket contains duplicate numbers');
  }
  
  // Check number ranges by column
  for (let col = 0; col < 9; col++) {
    const colNumbers = [];
    for (let row = 0; row < 3; row++) {
      if (ticket[row][col] !== null) {
        colNumbers.push(ticket[row][col]);
        const num = ticket[row][col];
        const validRange = getColumnNumbers(col);
        if (!validRange.includes(num)) {
          errors.push(`Number ${num} at row ${row}, col ${col} is out of valid range`);
        }
      }
    }
    
    // Check ascending order in column
    for (let i = 1; i < colNumbers.length; i++) {
      if (colNumbers[i] <= colNumbers[i - 1]) {
        errors.push(`Column ${col} numbers are not in ascending order`);
      }
    }
  }
  
  // Check all numbers are 1-90
  for (const num of allNumbers) {
    if (num < 1 || num > 90) {
      errors.push(`Number ${num} is out of range 1-90`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Generate multiple unique tickets for a game
 * @param {number} count 
 * @returns {Array<Array<Array<number|null>>>}
 */
function generateTickets(count) {
  const tickets = [];
  const usedNumberSets = new Set();
  
  for (let i = 0; i < count; i++) {
    let ticket;
    let key;
    let attempts = 0;
    
    do {
      ticket = generateTicket();
      key = ticket.flat().filter(n => n !== null).sort((a, b) => a - b).join(',');
      attempts++;
    } while (usedNumberSets.has(key) && attempts < 100);
    
    usedNumberSets.add(key);
    tickets.push(ticket);
  }
  
  return tickets;
}

module.exports = { generateTicket, validateTicket, generateTickets, getColumnNumbers, shuffle };
