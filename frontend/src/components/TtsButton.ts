import React, { useState, useEffect, useRef } from 'react';
import { synthesizeSpeech, type SupportedTtsLanguage } from '@madhuca/logic';

export interface TtsButtonProps {
  /** The plain-language alert line to read aloud. */
  text: string;
  /** BCP-47 language code — 'hi', 'pa', 'te', 'en'. */
  langCode?: string;
  /** Optional custom TTS API endpoint. */
  endpoint?: string;
}

export type TtsPlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export const TTS_LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi (हिंदी)',
  pa: 'Punjabi (ਪੰਜਾਬੀ)',
  te: 'Telugu (తెలుగు)',
  en: 'English',
};

// In-memory audio URL cache: key = `${lang}:${text}` -> Blob URL
const audioBlobCache = new Map<string, string>();

/** Plays the alert aloud via Jammy's Indic-TTS wrapper. */
export function TtsButton({ text, langCode = 'hi', endpoint }: TtsButtonProps) {
  const [playbackState, setPlaybackState] = useState<TtsPlaybackState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const langLabel = TTS_LANGUAGE_NAMES[langCode] ?? langCode.toUpperCase();
  const cacheKey = `${langCode}:${text.trim()}`;

  // Cleanup audio on unmount or when text/lang changes
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [text, langCode]);

  const handleTogglePlayback = async () => {
    // If currently playing, pause it
    if (playbackState === 'playing' && audioRef.current) {
      audioRef.current.pause();
      setPlaybackState('paused');
      return;
    }

    // If currently paused, resume it
    if (playbackState === 'paused' && audioRef.current) {
      audioRef.current.play().then(
        () => setPlaybackState('playing'),
        () => setPlaybackState('error')
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

    try {
      let audioUrl = audioBlobCache.get(cacheKey);

      if (!audioUrl) {
        // Synthesize via Jammy's Indic-TTS module
        const audioBuffer = await synthesizeSpeech(text, langCode as SupportedTtsLanguage, {
          endpoint,
        });
        const blob = new Blob([audioBuffer], { type: 'audio/wav' });
        audioUrl = URL.createObjectURL(blob);
        audioBlobCache.set(cacheKey, audioUrl);
      }

      if (typeof window !== 'undefined') {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setPlaybackState('idle');
        };

        audio.onerror = () => {
          setErrorMessage('Playback failed');
          setPlaybackState('error');
        };

        await audio.play();
        setPlaybackState('playing');
      } else {
        // Non-DOM / SSR fallback
        setPlaybackState('idle');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Audio synthesis failed';
      setErrorMessage(msg);
      setPlaybackState('error');
    }
  };

  const getButtonText = () => {
    switch (playbackState) {
      case 'loading':
        return 'Synthesizing voice...';
      case 'playing':
        return `Pause audio (${langLabel})`;
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
    React.createElement('span', { className: 'tts-button-content' }, getButtonText())
  );
}
