export interface TtsOptions {
  endpoint?: string;
  gender?: 'female' | 'male';
}

export const SUPPORTED_TTS_LANGUAGES = ['hi', 'pa', 'te', 'en'] as const;
export type SupportedTtsLanguage = (typeof SUPPORTED_TTS_LANGUAGES)[number];

const DEFAULT_INDIC_TTS_ENDPOINT = 'https://tts.indicnlp.org/synthesize';

/**
 * Decode base64 to ArrayBuffer using standard web APIs (runs in browser, Workers, and Node).
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Strip optional data URI prefix if present
  const cleanBase64 = base64.replace(/^data:audio\/[^;]+;base64,/, '');
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Speak an alert line aloud via self-hosted AI4Bharat Indic-TTS.
 * In: alert text + BCP-47 language code ('hi', 'pa' to start; 'te', 'en' supported).
 * Out: encoded audio bytes the frontend can hand to an <audio> element.
 * Owner: Jammy (delegation/jammy.md — Indic-TTS integration).
 */
export async function synthesizeSpeech(
  text: string,
  langCode: string,
  options?: TtsOptions,
): Promise<ArrayBuffer> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error('TTS synthesis text cannot be empty');
  }

  const normalizedLang = langCode.trim().toLowerCase();
  if (!SUPPORTED_TTS_LANGUAGES.includes(normalizedLang as SupportedTtsLanguage)) {
    throw new Error(
      `Unsupported TTS language code '${langCode}'. Supported languages: ${SUPPORTED_TTS_LANGUAGES.join(', ')}`,
    );
  }

  const endpoint = options?.endpoint || DEFAULT_INDIC_TTS_ENDPOINT;
  const gender = options?.gender || 'female';

  // Standard AI4Bharat Indic-TTS API payload
  const payload = {
    input: [{ source: trimmedText }],
    config: {
      language: {
        sourceLanguage: normalizedLang,
      },
      gender,
    },
    // Backwards-compatible aliases for alternative self-hosted endpoints
    text: trimmedText,
    lang: normalizedLang,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, audio/wav, audio/*;q=0.9',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Indic-TTS responded ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = (await response.json()) as {
      audio?: Array<{ audioContent?: string }>;
      audioContent?: string;
    };

    const base64Audio = data.audio?.[0]?.audioContent || data.audioContent;
    if (!base64Audio) {
      throw new Error('Indic-TTS JSON response contained no audioContent');
    }

    return base64ToArrayBuffer(base64Audio);
  }

  // Raw binary audio stream
  return response.arrayBuffer();
}

