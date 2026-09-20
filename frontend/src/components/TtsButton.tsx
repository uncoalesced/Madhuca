export interface TtsButtonProps {
  /** The plain-language alert line to read aloud. */
  text: string;
  /** BCP-47 code — 'hi' and 'pa' to start. */
  langCode: string;
}

/** Plays the alert aloud via Jammy's Indic-TTS wrapper. */
export function TtsButton({ text, langCode }: TtsButtonProps) {
  // TODO: call synthesizeSpeech(text, langCode), feed the ArrayBuffer to an
  //       <audio> element via a blob URL. Needs explicit loading/play/pause states.
  void text;
  void langCode;
  return <button type="button" />;
}
