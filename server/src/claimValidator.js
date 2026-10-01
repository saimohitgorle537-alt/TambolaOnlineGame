/**
 * Claim Validator for Tambola
 * 
 * Server-side validation of all winning claims.
 * Never trusts client data — verifies everything against server state.
 */

const CLAIM_TYPES = {
  EARLY_FIVE: 'early_five',
  TOP_LINE: 'top_line',
  MIDDLE_LINE: 'middle_line',
  BOTTOM_LINE: 'bottom_line',
  FULL_HOUSE: 'full_house',
};

// Define the order in which claims can be made
const CLAIM_ORDER = [
  CLAIM_TYPES.EARLY_FIVE,
  CLAIM_TYPES.TOP_LINE,
  CLAIM_TYPES.MIDDLE_LINE,
  CLAIM_TYPES.BOTTOM_LINE,
  CLAIM_TYPES.FULL_HOUSE,
];

/**
 * Get numbers in a specific row of a ticket
 * @param {Array<Array<number|null>>} ticket 
 * @param {number} rowIndex 
 * @returns {number[]}
 */
function getRowNumbers(ticket, rowIndex) {
  return ticket[rowIndex].filter(n => n !== null);
}

/**
 * Get all numbers in a ticket
 * @param {Array<Array<number|null>>} ticket 
 * @returns {number[]}
 */
function getAllNumbers(ticket) {
  return ticket.flat().filter(n => n !== null);
}

/**
 * Validate an Early Five claim
 * Player must have at least 5 of their ticket numbers called
 * @param {Array<Array<number|null>>} ticket 
 * @param {number[]} calledNumbers 
 * @param {number[]} markedNumbers - Numbers the player has marked
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEarlyFive(ticket, calledNumbers, markedNumbers) {
  const ticketNumbers = getAllNumbers(ticket);
  const calledSet = new Set(calledNumbers);
  
  // Check that marked numbers are on the ticket
  for (const num of markedNumbers) {
    if (!ticketNumbers.includes(num)) {
      return { valid: false, error: `Number ${num} is not on your ticket` };
    }
    if (!calledSet.has(num)) {
      return { valid: false, error: `Number ${num} has not been called yet` };
    }
  }
  
  // Count how many ticket numbers have been called AND marked
  const validMarks = markedNumbers.filter(n => ticketNumbers.includes(n) && calledSet.has(n));
  
  if (validMarks.length < 5) {
    return { valid: false, error: `Only ${validMarks.length} valid numbers marked, need at least 5` };
  }
  
  return { valid: true };
}

/**
 * Validate a line claim (Top, Middle, or Bottom)
 * @param {Array<Array<number|null>>} ticket 
 * @param {number[]} calledNumbers 
 * @param {number[]} markedNumbers 
 * @param {number} rowIndex - 0 for top, 1 for middle, 2 for bottom
 * @returns {{ valid: boolean, error?: string }}
 */
function validateLine(ticket, calledNumbers, markedNumbers, rowIndex) {
  const rowNumbers = getRowNumbers(ticket, rowIndex);
  const calledSet = new Set(calledNumbers);
  const markedSet = new Set(markedNumbers);
  
  // Every number in the row must be called AND marked
  for (const num of rowNumbers) {
    if (!calledSet.has(num)) {
      return { valid: false, error: `Number ${num} in the row has not been called yet` };
    }
    if (!markedSet.has(num)) {
      return { valid: false, error: `Number ${num} in the row has not been marked` };
    }
  }
  
  return { valid: true };
}

/**
 * Validate a Full House claim
 * All 15 numbers must be called and marked
 * @param {Array<Array<number|null>>} ticket 
 * @param {number[]} calledNumbers 
 * @param {number[]} markedNumbers 
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFullHouse(ticket, calledNumbers, markedNumbers) {
  const allNumbers = getAllNumbers(ticket);
  const calledSet = new Set(calledNumbers);
  const markedSet = new Set(markedNumbers);
  
  for (const num of allNumbers) {
    if (!calledSet.has(num)) {
      return { valid: false, error: `Number ${num} has not been called yet` };
    }
    if (!markedSet.has(num)) {
      return { valid: false, error: `Number ${num} has not been marked` };
    }
  }
  
  return { valid: true };
}

/**
 * Main claim validation function
 * @param {string} claimType 
 * @param {Array<Array<number|null>>} ticket 
 * @param {number[]} calledNumbers 
 * @param {number[]} markedNumbers 
 * @param {Object} wonCategories - Already won categories { [claimType]: playerName | winnerObj | winnerObj[] }
 * @param {Object} [categorySettings] - Optional category settings { [claimType]: { enabled: boolean, maxWinners: number } }
 * @returns {{ valid: boolean, error?: string }}
 */
function validateClaim(claimType, ticket, calledNumbers, markedNumbers, wonCategories = {}, categorySettings = null) {
  // Check if category is disabled
  if (categorySettings && categorySettings[claimType] && categorySettings[claimType].enabled === false) {
    return { valid: false, error: `${formatClaimName(claimType)} is disabled for this game.` };
  }

  // Check if category already reached max winners
  if (wonCategories) {
    const maxWinners = (categorySettings && categorySettings[claimType]?.maxWinners) || 1;
    const catWinners = wonCategories[claimType];
    if (catWinners) {
      if (Array.isArray(catWinners)) {
        if (catWinners.length >= maxWinners) {
          const names = catWinners.map(w => (typeof w === 'object' ? w.playerName : w)).join(', ');
          return { valid: false, error: `${formatClaimName(claimType)} has already been won by ${names}` };
        }
      } else {
        const name = typeof catWinners === 'object' ? catWinners.playerName : catWinners;
        return { valid: false, error: `${formatClaimName(claimType)} has already been won by ${name}` };
      }
    }
  }

  // Validate based on claim type
  switch (claimType) {
    case CLAIM_TYPES.EARLY_FIVE:
      return validateEarlyFive(ticket, calledNumbers, markedNumbers);
    
    case CLAIM_TYPES.TOP_LINE:
      return validateLine(ticket, calledNumbers, markedNumbers, 0);
    
    case CLAIM_TYPES.MIDDLE_LINE:
      return validateLine(ticket, calledNumbers, markedNumbers, 1);
    
    case CLAIM_TYPES.BOTTOM_LINE:
      return validateLine(ticket, calledNumbers, markedNumbers, 2);
    
    case CLAIM_TYPES.FULL_HOUSE:
      return validateFullHouse(ticket, calledNumbers, markedNumbers);
    
    default:
      return { valid: false, error: `Unknown claim type: ${claimType}` };
  }
}

/**
 * Format claim type for display
 * @param {string} claimType 
 * @returns {string}
 */
function formatClaimName(claimType) {
  const names = {
    [CLAIM_TYPES.EARLY_FIVE]: 'Early Five',
    [CLAIM_TYPES.TOP_LINE]: 'Top Line',
    [CLAIM_TYPES.MIDDLE_LINE]: 'Middle Line',
    [CLAIM_TYPES.BOTTOM_LINE]: 'Bottom Line',
    [CLAIM_TYPES.FULL_HOUSE]: 'Full House',
  };
  return names[claimType] || claimType;
}

module.exports = {
  CLAIM_TYPES,
  CLAIM_ORDER,
  validateClaim,
  validateEarlyFive,
  validateLine,
  validateFullHouse,
  formatClaimName,
  getRowNumbers,
  getAllNumbers,
};
