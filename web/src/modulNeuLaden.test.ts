import { describe, expect, it } from 'vitest';
import { istVeraltetesModul } from './modulNeuLaden';

describe('veraltete Module nach Update', () => {
  it('erkennt fehlende Code-Teile in Chrome, Safari und Firefox', () => {
    expect(istVeraltetesModul(new TypeError('Failed to fetch dynamically imported module: https://x/assets/jspdf.es.min-BJfQxxrZ.js'))).toBe(true);
    expect(istVeraltetesModul(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(istVeraltetesModul(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(istVeraltetesModul(new Error('PDF kaputt'))).toBe(false);
  });
});
