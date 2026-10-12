import { CALC_CASES } from '../../test/calc-cases.js';
import { CalcError, computeAmount } from './calc.js';

describe('computeAmount', () => {
  it.each(CALC_CASES)('$name', ({ type, inputs, expected }) => {
    if (typeof expected === 'string') {
      expect(() => computeAmount(type, inputs)).toThrow(CalcError);
      expect(() => computeAmount(type, inputs)).toThrow(expected);
    } else {
      expect(computeAmount(type, inputs)).toBe(expected);
    }
  });

  it('never returns more than two decimals', () => {
    const result = computeAmount('SPLIT', [100, 7]);
    expect(Math.round(result * 100) / 100).toBe(result);
  });

  it('does not touch the caller\'s array', () => {
    const inputs = [3, 4];
    computeAmount('MULTIPLY', inputs);
    expect(inputs).toEqual([3, 4]);
  });
});
