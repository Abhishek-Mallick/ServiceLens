import { describe, it, expect } from 'vitest';
import { parseCsv, parseRoster, findOncall, serviceKey } from '@/lib/oncall/roster';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });
});

describe('serviceKey', () => {
  it('normalises names so sheet rows match service names forgivingly', () => {
    expect(serviceKey('Checkout Service')).toBe('checkout');
    expect(serviceKey('checkout-service')).toBe('checkout');
    expect(serviceKey('ecommerce-product-service')).toBe('ecommerce-product');
    expect(serviceKey('service')).toBe('service');
  });
});

describe('parseRoster', () => {
  const csv = [
    'Service Name,oncall_name,oncall_email,escalation_email',
    'checkout-service,Alice Liu,alice@acme.com,lead@acme.com',
    'Payments,Bob,bob@acme.com,',
    '*,Platform,platform@acme.com,',
    'broken,Eve,not-an-email,',
  ].join('\n');

  it('parses valid rows and reports bad ones with row numbers', () => {
    const { entries, errors } = parseRoster(csv);
    expect(entries.map((e) => e.email)).toEqual(['alice@acme.com', 'bob@acme.com', 'platform@acme.com']);
    expect(errors).toEqual(['Row 5: "not-an-email" is not a valid oncall_email.']);
    expect(entries[0].escalationEmail).toBe('lead@acme.com');
    expect(entries[1].escalationEmail).toBeNull();
  });

  it('rejects a sheet without the required columns', () => {
    expect(parseRoster('name,email\nx,y@z.com').errors[0]).toMatch(/Missing column/);
  });

  it('matches by service, then falls back to "*"', () => {
    const { entries } = parseRoster(csv);
    expect(findOncall(entries, 'Checkout Service')?.name).toBe('Alice Liu');
    expect(findOncall(entries, 'payments-service')?.name).toBe('Bob');
    expect(findOncall(entries, 'search')?.name).toBe('Platform');
    expect(findOncall(entries.filter((e) => e.key !== '*'), 'search')).toBeNull();
  });
});
