import { describe, expect, it } from 'vitest';
import { LANGUAGES, getStrings } from './strings';

describe('frontend dictionaries', () => {
  it('ships English, Hindi, and Marathi', () => {
    expect(LANGUAGES.filter((l) => l.supported).map((l) => l.code).sort()).toEqual(['en', 'hi', 'mr']);
  });

  it('covers every key in all locales (no missing labels)', () => {
    const en = getStrings('en');
    for (const locale of ['hi', 'mr'] as const) {
      const s = getStrings(locale);
      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        expect(s[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it('translates fisherman-facing chrome to Marathi', () => {
    const mr = getStrings('mr');
    expect(mr.tagline).toContain('सागरी');
    expect(mr.suggested[0]).toContain('मासेमारी');
    expect(mr.viewMap).toBe('नकाशा पहा');
  });
});
