/**
 * Speak an alert line aloud via self-hosted AI4Bharat Indic-TTS.
 * In: alert text + BCP-47 language code ('hi', 'pa' to start).
 * Out: encoded audio bytes the frontend can hand to an <audio> element.
 * Owner: Jammy (delegation/jammy.md — Indic-TTS integration).
 */
export async function synthesizeSpeech(text: string, langCode: string): Promise<ArrayBuffer> {
  // TODO: POST to the self-hosted Indic-TTS endpoint, return the audio body.
  //       Keep it fetch-only — no Node fs/Buffer, so this runs on Workers too.
  void text;
  void langCode;
  throw new Error('not implemented');
}
