import { generateReqCode, isAtPosition } from './index';

describe('generateReqCode', () => {
  it('returns a 32-character hex string', () => {
    const code = generateReqCode();
    expect(code).toHaveLength(32);
    expect(code).toMatch(/^[a-f0-9]{32}$/);
  });

  it('returns unique values on each call', () => {
    const a = generateReqCode();
    const b = generateReqCode();
    expect(a).not.toBe(b);
  });
});

describe('isAtPosition', () => {
  const target = '012000BB012000';

  it('returns true for exact match', () => {
    expect(isAtPosition('12000', '12000', target, 0)).toBe(true);
  });

  it('returns true within tolerance', () => {
    expect(isAtPosition('12050', '11950', target, 100)).toBe(true);
  });

  it('returns false outside tolerance', () => {
    expect(isAtPosition('12200', '12000', target, 100)).toBe(false);
  });

  it('returns false for completely different position', () => {
    expect(isAtPosition('1000', '1000', target, 100)).toBe(false);
  });

  it('handles zero-padded input strings', () => {
    expect(isAtPosition('012000', '012000', target, 0)).toBe(true);
  });

  it('returns false for invalid target format', () => {
    expect(isAtPosition('12000', '12000', 'INVALID', 100)).toBe(false);
  });

  it('returns false when only X is within tolerance', () => {
    expect(isAtPosition('12000', '13000', target, 100)).toBe(false);
  });

  it('returns true at exact boundary of tolerance', () => {
    expect(isAtPosition('12100', '12000', target, 100)).toBe(true);
    expect(isAtPosition('12101', '12000', target, 100)).toBe(false);
  });
});
