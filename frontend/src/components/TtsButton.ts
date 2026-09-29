import React, { useState, useEffect, useRef } from 'react';
import { synthesizeWithPiper } from '../utils/piperVoice.ts';

export interface TtsButtonProps {
  /** The plain-language alert line to read aloud. */
  text: string;
  /** BCP-47 language code — 'hi', 'kn', 'te', 'en'. */
  langCode?: string;
}

export type TtsPlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

type TtsError = 'unavailable' | 'noText' | 'playbackFailed';

/** Button copy per alert language, so the button speaks the language the alert is in. */
export const TTS_UI: Record<
  string,
  {
    listen: string;
    stop: string;
    pause: string;
    resume: string;
    retry: string;
    preparing: string;
    /** `mb` is "12 / 80" or "12" when the size is unknown. */
    downloading: (mb: string) => string;
    errors: Record<TtsError, string>;
  }
> = {
  en: {
    listen: 'Listen Alert in English',
    stop: 'Stop audio',
    pause: 'Pause audio',
    resume: 'Resume audio',
    retry: 'Retry audio',
    preparing: 'Preparing voice...',
    downloading: (mb) => `Downloading voice ${mb} MB (one time)`,
    errors: { unavailable: 'voice unavailable, read the alert text', noText: 'No alert text to read', playbackFailed: 'Playback failed' },
  },
  hi: {
    listen: 'अलर्ट हिंदी में सुनें',
    stop: 'ऑडियो बंद करें',
    pause: 'ऑडियो रोकें',
    resume: 'ऑडियो फिर से चलाएं',
    retry: 'फिर से कोशिश करें',
    preparing: 'आवाज़ तैयार हो रही है...',
    downloading: (mb) => `आवाज़ डाउनलोड हो रही है ${mb} MB (केवल एक बार)`,
    errors: { unavailable: 'आवाज़ उपलब्ध नहीं, अलर्ट पढ़ें', noText: 'पढ़ने के लिए कोई अलर्ट नहीं', playbackFailed: 'ऑडियो नहीं चला' },
  },
  kn: {
    listen: 'ಎಚ್ಚರಿಕೆಯನ್ನು ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ',
    stop: 'ಆಡಿಯೋ ನಿಲ್ಲಿಸಿ',
    pause: 'ಆಡಿಯೋ ವಿರಾಮಗೊಳಿಸಿ',
    resume: 'ಆಡಿಯೋ ಮುಂದುವರಿಸಿ',
    retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    preparing: 'ಧ್ವನಿ ಸಿದ್ಧವಾಗುತ್ತಿದೆ...',
    downloading: (mb) => `ಧ್ವನಿ ಡೌನ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ ${mb} MB (ಒಮ್ಮೆ ಮಾತ್ರ)`,
    errors: { unavailable: 'ಧ್ವನಿ ಲಭ್ಯವಿಲ್ಲ, ಎಚ್ಚರಿಕೆಯನ್ನು ಓದಿ', noText: 'ಓದಲು ಯಾವುದೇ ಎಚ್ಚರಿಕೆ ಇಲ್ಲ', playbackFailed: 'ಆಡಿಯೋ ಪ್ಲೇ ಆಗಲಿಲ್ಲ' },
  },
  te: {
    listen: 'హెచ్చరికను తెలుగులో వినండి',
    stop: 'ఆడియో ఆపండి',
    pause: 'ఆడియో విరామం',
    resume: 'ఆడియో కొనసాగించండి',
    retry: 'మళ్ళీ ప్రయత్నించండి',
    preparing: 'వాయిస్ సిద్ధమవుతోంది...',
    downloading: (mb) => `వాయిస్ డౌన్‌లోడ్ అవుతోంది ${mb} MB (ఒక్కసారి మాత్రమే)`,
    errors: { unavailable: 'వాయిస్ అందుబాటులో లేదు, హెచ్చరికను చదవండి', noText: 'చదవడానికి హెచ్చరిక లేదు', playbackFailed: 'ఆడియో ప్లే కాలేదు' },
  },
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
  const [errorKey, setErrorKey] = useState<TtsError | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRef = useRef(false);

  const ui = TTS_UI[langCode] ?? TTS_UI.en!;
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
          ui.downloading(total ? `${Math.round(loaded / 1e6)} / ${Math.round(total / 1e6)}` : `${Math.round(loaded / 1e6)}`),
        ),
      );
      setProgress(ui.preparing);
      audioUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      audioBlobCache.set(cacheKey, audioUrl);
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaybackState('idle');
    audio.onerror = () => {
      setErrorKey('playbackFailed');
      setPlaybackState('error');
    };
    await audio.play();
    setProgress(null);
    setPlaybackState('playing');
  };

  const fail = () => {
    setProgress(null);
    setErrorKey('unavailable');
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
      setErrorKey('noText');
      setPlaybackState('error');
      return;
    }

    setPlaybackState('loading');
    setErrorKey(null);

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
        return progress ?? ui.preparing;
      case 'playing':
        return speakingRef.current ? ui.stop : ui.pause;
      case 'paused':
        return ui.resume;
      case 'error':
        return errorKey ? `${ui.retry} (${ui.errors[errorKey]})` : ui.retry;
      case 'idle':
      default:
        return ui.listen;
    }
  };

  return React.createElement(
    'button',
    {
      type: 'button',
      className: `tts-button tts-state-${playbackState}`,
      lang: langCode,
      'aria-live': 'polite',
      disabled: playbackState === 'loading',
      onClick: handleTogglePlayback,
    },
    React.createElement('span', { className: 'tts-button-content' }, getButtonText()),
  );
}
