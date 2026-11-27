import { calculateOrderTotals } from '@az/shared';
import { dec } from '../../common/utils/money';
import { lineAmounts, orderAmounts, paymentState } from './order-math';

describe('order maths', () => {
  it('calculates a line with shop fabric, rounding to paisa', () => {
    const l = lineAmounts({ quantity: 3, stitchingPrice: '1999.99', fabricQuantity: '4.333', fabricRate: '777.77', additionalCharges: '50', chargeFabric: true });
    expect(l.stitchingAmount.toFixed(2)).toBe('5999.97');
    expect(l.fabricAmount.toFixed(2)).toBe('3370.08'); // 4.333 x 777.77 = 3370.07741
    expect(l.lineTotal.toFixed(2)).toBe('9420.05');
    expect(l.fabricPerPiece.toFixed(3)).toBe('1.444');
  });

  it("never charges the customer's own fabric", () => {
    const l = lineAmounts({ quantity: 1, stitchingPrice: '2500', fabricQuantity: '4.5', fabricRate: '1000', chargeFabric: false });
    expect(l.fabricAmount.toFixed(2)).toBe('0.00');
    expect(l.lineTotal.toFixed(2)).toBe('2500.00');
  });

  it('matches the shared frontend calculation exactly', () => {
    const inputs = [
      { quantity: 2, stitchingPrice: '2500', fabricQuantity: '9', fabricRate: '850.50', additionalCharges: '300' },
      { quantity: 1, stitchingPrice: '3000.10', fabricQuantity: '1.255', fabricRate: '333.33' },
    ];
    const back = orderAmounts(inputs.map((i) => lineAmounts({ ...i, chargeFabric: true })), '200', '500');
    const front = calculateOrderTotals(inputs, '200', '500');
    expect(front.totalAmount).toBe(back.totalAmount.toFixed(2));
    expect(front.fabricTotal).toBe(back.fabricTotal.toFixed(2));
    expect(front.subtotal).toBe(back.subtotal.toFixed(2));
  });

  it('derives payment status and balance', () => {
    expect(paymentState(dec(1000), dec(0))).toMatchObject({ paymentStatus: 'UNPAID' });
    expect(paymentState(dec(1000), dec(400)).balanceAmount.toFixed(2)).toBe('600.00');
    expect(paymentState(dec(1000), dec(400)).paymentStatus).toBe('PARTIAL');
    expect(paymentState(dec(1000), dec(1000)).paymentStatus).toBe('PAID');
    expect(paymentState(dec(0), dec(500))).toMatchObject({ paymentStatus: 'OVERPAID' });
    expect(paymentState(dec(0), dec(0)).paymentStatus).toBe('PAID');
  });
});
