import type { ResponseLocale } from '../../shared/orca-contract.js';

const DEVANAGARI = /[\u0900-\u097F]/;

const MR_MARKERS = [
  'आहे', 'आहेत', 'उद्या', 'सकाळी', 'मासेमारी', 'मासे', 'काळजी', 'ठिकाण',
  'कुठे', 'सुरक्षितता', 'धोका', 'परत', 'किनाऱ्या', 'होड्या', 'होडी', 'वारे',
];

const HI_MARKERS = [
  'है', 'हैं', 'क्या', 'मछली', 'मछुआ', 'कल', 'सुबह', 'कैसे', 'कहाँ',
  'किधर', 'खतरा', 'लौट', 'किनारे', 'नावें', 'हवाएं', 'मौसम',
];

/**
 * Response-language detection. Explicit UI locale wins for Latin-script
 * input; Devanagari input is matched against small distinctive word lists
 * (Marathi vs Hindi share script but differ in vocabulary). Documented
 * heuristic — wrong guesses still yield a safe, complete answer.
 */
export function detectLocale(message: string, fallback: ResponseLocale = 'en'): ResponseLocale {
  if (!DEVANAGARI.test(message)) return fallback;
  const q = message;
  const mrHits = MR_MARKERS.filter((w) => q.includes(w)).length;
  const hiHits = HI_MARKERS.filter((w) => q.includes(w)).length;
  // 'सुरक्षित' exists in both — only distinctive markers decide.
  if (mrHits > 0 && mrHits >= hiHits) return 'mr';
  if (hiHits > 0) return 'hi';
  return fallback === 'en' ? 'hi' : fallback;
}
