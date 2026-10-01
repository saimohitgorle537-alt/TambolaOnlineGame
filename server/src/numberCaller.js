/**
 * Number Generator for Tambola
 * 
 * Creates a pre-shuffled list of numbers 1-90 to ensure:
 * - Every number is called exactly once
 * - Order is truly random
 * - No duplicates possible
 */

const { shuffle } = require('./ticketGenerator');

/**
 * Create a shuffled sequence of numbers 1-90
 * @returns {number[]}
 */
function createNumberSequence() {
  const numbers = Array.from({ length: 90 }, (_, i) => i + 1);
  return shuffle(numbers);
}

/**
 * NumberCaller class manages the calling sequence
 */
class NumberCaller {
  constructor() {
    this.sequence = createNumberSequence();
    this.calledNumbers = [];
    this.currentIndex = 0;
  }

  /**
   * Call the next number
   * @returns {{ number: number, remaining: number } | null}
   */
  callNext() {
    if (this.currentIndex >= this.sequence.length) {
      return null; // All numbers called
    }

    const number = this.sequence[this.currentIndex];
    this.calledNumbers.push(number);
    this.currentIndex++;

    return {
      number,
      remaining: this.sequence.length - this.currentIndex,
      totalCalled: this.calledNumbers.length,
    };
  }

  /**
   * Get the last called number
   * @returns {number | null}
   */
  getLastCalled() {
    return this.calledNumbers.length > 0
      ? this.calledNumbers[this.calledNumbers.length - 1]
      : null;
  }

  /**
   * Check if a specific number has been called
   * @param {number} num 
   * @returns {boolean}
   */
  isNumberCalled(num) {
    return this.calledNumbers.includes(num);
  }

  /**
   * Get all called numbers
   * @returns {number[]}
   */
  getCalledNumbers() {
    return [...this.calledNumbers];
  }

  /**
   * Get remaining count
   * @returns {number}
   */
  getRemainingCount() {
    return this.sequence.length - this.currentIndex;
  }

  /**
   * Check if all numbers have been called
   * @returns {boolean}
   */
  isComplete() {
    return this.currentIndex >= this.sequence.length;
  }

  /**
   * Reset the caller with a fresh sequence
   */
  reset() {
    this.sequence = createNumberSequence();
    this.calledNumbers = [];
    this.currentIndex = 0;
  }

  /**
   * Serialize state for transmission
   */
  toJSON() {
    return {
      calledNumbers: this.calledNumbers,
      lastCalled: this.getLastCalled(),
      remaining: this.getRemainingCount(),
      totalCalled: this.calledNumbers.length,
      isComplete: this.isComplete(),
    };
  }
}

module.exports = { NumberCaller, createNumberSequence };
