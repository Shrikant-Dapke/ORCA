import { describe, expect, it } from 'vitest';
import { detectLocale } from './detect.js';
import { joinList, tr } from './responses.js';

describe('detectLocale', () => {
  it('keeps explicit UI locale for Latin-script input', () => {
    expect(detectLocale('Can I go fishing tomorrow?', 'en')).toBe('en');
    expect(detectLocale('Can I go fishing tomorrow?', 'hi')).toBe('hi');
  });

  it('detects the Marathi demo question', () => {
    expect(detectLocale('उद्या सकाळी मासेमारीला जाणे सुरक्षित आहे का?', 'en')).toBe('mr');
  });

  it('detects Hindi input', () => {
    expect(detectLocale('क्या कल सुबह मछली पकड़ना सुरक्षित है?', 'en')).toBe('hi');
  });

  it('falls back safely for bare Devanagari', () => {
    expect(detectLocale('समुद्र', 'en')).toBe('hi');
    expect(detectLocale('समुद्र', 'mr')).toBe('mr');
  });
});

describe('tr dictionaries', () => {
  it('keeps English byte-identical to legacy strings', () => {
    expect(tr('en', 'hl.safe.tomorrow')).toBe('SAFE TO GO');
    expect(tr('en', 'sum.safe.tomorrow')).toBe(
      'Tomorrow morning looks suitable for fishing in your selected area.',
    );
    expect(tr('en', 'adv.calm.warning')).toBe('Winds may become stronger after 3:00 PM.');
  });

  it('translates safety headlines to Marathi and Hindi', () => {
    expect(tr('mr', 'hl.danger')).toContain('धोका');
    expect(tr('hi', 'hl.danger')).toContain('खतरा');
    expect(tr('mr', 'sum.danger')).toContain('किनाऱ्यावरच');
  });

  it('joins lists per language', () => {
    expect(joinList('en', ['a', 'b'])).toBe('a and b');
    expect(joinList('hi', ['a', 'b'])).toBe('a और b');
    expect(joinList('mr', ['a', 'b'])).toBe('a आणि b');
  });

  it('falls back to English for unknown keys', () => {
    expect(tr('mr', 'no.such.key')).toBe('no.such.key');
  });
});
