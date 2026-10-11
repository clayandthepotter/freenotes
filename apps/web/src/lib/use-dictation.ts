import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** The browser's speech recognition, where it exists (Chrome, Safari, Edge). Phrases arrive one at a time. */
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function recognitionCtor(): (new () => RecognitionLike) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export interface Dictation {
  readonly supported: boolean;
  readonly listening: boolean;
  readonly error: string | undefined;
  start(): void;
  stop(): void;
}

export function useDictation(onPhrase: (phrase: string) => void): Dictation {
  const Ctor = useMemo(recognitionCtor, []);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();
  const rec = useRef<RecognitionLike | undefined>(undefined);
  const handler = useRef(onPhrase);
  handler.current = onPhrase;

  const stop = useCallback(() => {
    rec.current?.stop();
    rec.current = undefined;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!Ctor || rec.current) return;
    setError(undefined);
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res?.isFinal) continue;
        const phrase = res[0]?.transcript.trim();
        if (phrase) handler.current(phrase.charAt(0).toUpperCase() + phrase.slice(1));
      }
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone access was refused. Allow it in the browser's site settings." : e.error === "no-speech" ? undefined : `Dictation stopped: ${e.error}.`);
      if (e.error !== "no-speech") stop();
    };
    r.onend = () => {
      if (rec.current === r) {
        rec.current = undefined;
        setListening(false);
      }
    };
    rec.current = r;
    r.start();
    setListening(true);
  }, [Ctor, stop]);

  useEffect(() => () => rec.current?.stop(), []);

  return useMemo(() => ({ supported: Boolean(Ctor), listening, error, start, stop }), [Ctor, listening, error, start, stop]);
}
