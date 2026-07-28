export type SpeechRecognitionResultLike = {
  transcript: string;
};

export type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
};

export type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

export type SpeechRecognitionLike = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}
