import { addMoney, subMoney } from './money.js';

describe('money helpers', () => {
  it('adds without floating-point error', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
  });

  it('does not drift over many additions', () => {
    let total = 0;
    for (let i = 0; i < 10_000; i++) total = addMoney(total, 0.1);
    expect(total).toBe(1000);
  });

  it('subtracts without floating-point error', () => {
    expect(subMoney(0.3, 0.1)).toBe(0.2);
    expect(subMoney(1, 1.1)).toBe(-0.1);
  });
});
