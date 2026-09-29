import React, { useState, useEffect, useRef } from 'react';
import { synthesizeWithPiper } from '../utils/piperVoice.ts';

export interface TtsButtonProps {
  /** The plain-language alert line to read aloud. */
  text: string;
  /** BCP-47 language code — 'hi', 'pa', 'te', 'en'. */
  langCode?: string;
}

export type TtsPlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export const TTS_LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi (हिंदी)',
  pa: 'Punjabi (ਪੰਜਾਬੀ)',
  te: 'Telugu (తెలుగు)',
  en: 'English',
};

/**
 * The device's own voice for this language, if it has one. Chrome fills its voice
 * list asynchronously, so an empty first answer means "not loaded yet", not "none":
 * wait for `voiceschanged` (bounded) before deciding. Reading Hindi text with an
 * English voice would be worse than silence, so only a matching language counts.
 */
export async function browserVoiceFor(
  langCode: string,
  synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined,
  timeoutMs = 1500,
): Promise<SpeechSynthesisVoice | undefined> {
  if (!synth) return undefined;
  let voices = synth.getVoices();
  if (!voices.length) {
    voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const done = () => resolve(synth.getVoices());
      synth.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, timeoutMs);
    });
  }
  return voices.find((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === langCode);
}

// In-memory audio URL cache: key = `${lang}:${text}` -> Blob URL
const audioBlobCache = new Map<string, string>();

/**
 * Reads the alert aloud, free and open source end to end: the device's own voice when
 * it has this language, else a Piper voice run in the browser (utils/piperVoice.ts),
 * else an honest "voice unavailable".
 */
export function TtsButton({ text, langCode = 'hi' }: TtsButtonProps) {
  const [playbackState, setPlaybackState] = useState<TtsPlaybackState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRef = useRef(false);

  const langLabel = TTS_LANGUAGE_NAMES[langCode] ?? langCode.toUpperCase();
  const cacheKey = `${langCode}:${text.trim()}`;

  // Stop whatever is playing when the text or language changes, or on unmount.
  useEffect(() => {
    setPlaybackState('idle');
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (speakingRef.current) window.speechSynthesis?.cancel();
      speakingRef.current = false;
    };
  }, [text, langCode]);

  const playPiper = async () => {
    let audioUrl = audioBlobCache.get(cacheKey);
    if (!audioUrl) {
      const wav = await synthesizeWithPiper(text, langCode, (loaded, total) =>
        setProgress(
          total
            ? `Downloading voice ${Math.round(loaded / 1e6)} / ${Math.round(total / 1e6)} MB (one time)`
            : `Downloading voice ${Math.round(loaded / 1e6)} MB (one time)`,
        ),
      );
      setProgress('Preparing voice...');
      audioUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      audioBlobCache.set(cacheKey, audioUrl);
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaybackState('idle');
    audio.onerror = () => {
      setErrorMessage('Playback failed');
      setPlaybackState('error');
    };
    await audio.play();
    setProgress(null);
    setPlaybackState('playing');
  };

  const fail = () => {
    setProgress(null);
    setErrorMessage('voice unavailable, read the alert text');
    setPlaybackState('error');
  };

  const handleTogglePlayback = async () => {
    if (playbackState === 'playing') {
      if (speakingRef.current) {
        // speechSynthesis.pause() is unreliable on Android; stopping is honest.
        window.speechSynthesis.cancel();
        speakingRef.current = false;
        setPlaybackState('idle');
      } else if (audioRef.current) {
        audioRef.current.pause();
        setPlaybackState('paused');
      }
      return;
    }
    if (playbackState === 'paused' && audioRef.current) {
      audioRef.current.play().then(
        () => setPlaybackState('playing'),
        () => setPlaybackState('error'),
      );
      return;
    }
    if (!text.trim()) {
      setErrorMessage('No alert text to read');
      setPlaybackState('error');
      return;
    }

    setPlaybackState('loading');
    setErrorMessage(null);

    const voice = await browserVoiceFor(langCode);
    if (voice) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.onend = () => {
        speakingRef.current = false;
        setPlaybackState('idle');
      };
      // Network voices (Chrome's Google voices) can fail after starting: fall through to Piper.
      utterance.onerror = (e) => {
        speakingRef.current = false;
        if (e.error === 'canceled' || e.error === 'interrupted') return;
        setPlaybackState('loading');
        playPiper().catch(fail);
      };
      window.speechSynthesis.cancel();
      speakingRef.current = true;
      window.speechSynthesis.speak(utterance);
      setPlaybackState('playing');
      return;
    }

    try {
      await playPiper();
    } catch {
      fail();
    }
  };

  const getButtonText = () => {
    switch (playbackState) {
      case 'loading':
        return progress ?? 'Preparing voice...';
      case 'playing':
        return `${speakingRef.current ? 'Stop' : 'Pause'} audio (${langLabel})`;
      case 'paused':
        return `Resume audio (${langLabel})`;
      case 'error':
        return `Retry audio (${errorMessage ?? 'Failed'})`;
      case 'idle':
      default:
        return `Listen Alert in ${langLabel}`;
    }
  };

  return React.createElement(
    'button',
    {
      type: 'button',
      className: `tts-button tts-state-${playbackState}`,
      'aria-label': `Listen to fire alert aloud in ${langLabel}`,
      'aria-live': 'polite',
      disabled: playbackState === 'loading',
      onClick: handleTogglePlayback,
    },
    React.createElement('span', { className: 'tts-button-content' }, getButtonText()),
  );
}
