import { describe, expect, it } from 'vitest';
import { ratingSummary, reviewMonth, validateReview } from './reviews';

describe('ratingSummary', () => {
  it('averages to one decimal and counts', () => {
    expect(ratingSummary([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ count: 3, avg: 4.3 });
  });
  it('empty list gives null average', () => {
    expect(ratingSummary([])).toEqual({ count: 0, avg: null });
  });
});

describe('validateReview', () => {
  it('requires 1-5 stars and caps comment length', () => {
    expect(validateReview(0, '')).toHaveProperty('rating');
    expect(validateReview(6, '')).toHaveProperty('rating');
    expect(validateReview(4, 'x'.repeat(501))).toHaveProperty('comment');
    expect(validateReview(5, '')).toEqual({});
    expect(validateReview(3, 'Rất tốt')).toEqual({});
  });
});

describe('reviewMonth', () => {
  it('formats an ISO timestamp as M/YYYY', () => {
    expect(reviewMonth('2026-10-05T07:00:00Z')).toBe('10/2026');
    expect(reviewMonth('not-a-date')).toBe('');
  });
});
