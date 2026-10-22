import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODULE_FILE = join(__dirname, 'sales.module.ts');

describe('sales routes', () => {
  it('registers the delivery order controller before the invoice wildcard', () => {
    // /sales/delivery-orders has to be matched before /sales/:id, otherwise
    // the invoice route answers "Sales invoice not found" for the delivery
    // order list. Express matches in registration order, so the order of the
    // controllers array is the order the routes are registered in.
    const source = readFileSync(MODULE_FILE, 'utf8');
    const controllers = /controllers:\s*\[([^\]]*)\]/.exec(source)?.[1] ?? '';
    const order = controllers
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    expect(order).toContain('DeliveryOrdersController');
    expect(order).toContain('SalesController');
    expect(order.indexOf('DeliveryOrdersController')).toBeLessThan(order.indexOf('SalesController'));
  });
});
