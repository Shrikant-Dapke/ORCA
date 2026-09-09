import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechApi {
  supported: boolean;
  listening: boolean;
  interim: string;
  start: () => void;
  stop: () => void;
}

type Recog = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

/**
 * Browser speech recognition (Web Speech API) with graceful fallback.
 * - Chrome/Edge: real recognition via webkitSpeechRecognition.
 * - Anywhere else / denied mic: `supported === false`, UI shows a
 *   friendly fallback message instead of breaking.
 */
export function useSpeechRecognition(onFinal: (text: string) => void): SpeechApi {
  const recogRef = useRef<Recog | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [supported, setSupported] = useState(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w['SpeechRecognition'] ?? w['webkitSpeechRecognition']) as
      | (new () => Recog)
      | undefined;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    try {
      const r = new Ctor();
      r.lang = 'en-IN';
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (e: any) => {
        let interimText = '';
        let finalText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript;
          else interimText += res[0].transcript;
        }
        setInterim(interimText);
        if (finalText.trim()) {
          onFinalRef.current(finalText.trim());
          setInterim('');
        }
      };
      r.onerror = () => {
        setListening(false);
        setInterim('');
      };
      r.onend = () => {
        setListening(false);
        setInterim('');
      };
      recogRef.current = r;
      setSupported(true);
    } catch {
      setSupported(false);
    }
    return () => {
      try {
        recogRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  const start = useCallback(() => {
    const r = recogRef.current;
    if (!r) return;
    setInterim('');
    try {
      r.start();
      setListening(true);
    } catch {
      /* already started */
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recogRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }, []);

  return { supported, listening, interim, start, stop };
}

/** Optional voice read-out of ORCA answers (speechSynthesis, guarded). */
export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-IN';
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch {
    /* voice output is best-effort only */
  }
}
