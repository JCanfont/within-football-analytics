import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchInsightData, MatchListItem } from "../types/api";
import type { SpeechRecognitionErrorEventLike, SpeechRecognitionEventLike, SpeechRecognitionLike } from "../types/speech";
import { buildSpokenSummary, displaySpokenTeamName, resolveMatchFromSpeech, type SpeechMatchOption } from "../utils/voiceAssistant";

type VoiceAssistantOptions = {
  matches: MatchListItem[];
  selectedInsight: MatchInsightData | null;
  onSelectMatch: (matchId: number) => void;
};

type VoiceAssistantState = {
  isSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  message: string;
  pendingOptions: SpeechMatchOption[];
  speechSegments: string[];
  currentSpeechSegment: number;
  currentSpeechText: string;
  speechDigest: string[];
  startListening: () => void;
  stopListening: () => void;
  submitTextRequest: (text: string) => void;
  choosePendingOption: (matchId: number) => void;
  speakCurrentAnalysis: () => void;
  stopSpeaking: () => void;
  resumeSpeaking: () => void;
  previousSpeechSegment: () => void;
  nextSpeechSegment: () => void;
  seekSpeechSegment: (index: number) => void;
};

export function useVoiceAssistant({
  matches,
  selectedInsight,
  onSelectMatch,
}: VoiceAssistantOptions): VoiceAssistantState {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechRunRef = useRef(0);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("Pulsa el microfono y di un partido importado.");
  const [pendingOptions, setPendingOptions] = useState<SpeechMatchOption[]>([]);
  const [speechSegments, setSpeechSegments] = useState<string[]>([]);
  const [currentSpeechSegment, setCurrentSpeechSegment] = useState(0);
  const currentSpeechText = speechSegments[currentSpeechSegment] ?? "";
  const speechDigest = useMemo(() => summarizeSpeechSegments(speechSegments), [speechSegments]);

  const recognitionConstructor = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    return window.SpeechRecognition ?? window.webkitSpeechRecognition;
  }, []);

  const isSupported = Boolean(recognitionConstructor) && typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!selectedInsight) {
      setSpeechSegments([]);
      setCurrentSpeechSegment(0);
      setIsSpeaking(false);
      return;
    }
    const segments = splitSpokenText(buildSpokenSummary(selectedInsight));
    setSpeechSegments(segments);
    setCurrentSpeechSegment(0);
  }, [selectedInsight]);

  function startListening() {
    if (!recognitionConstructor) {
      setMessage("Este navegador no admite reconocimiento de voz.");
      return;
    }

    if (matches.length === 0) {
      const emptyMessage = "Primero importa partidos para que pueda encontrarlos por voz.";
      setMessage(emptyMessage);
      speak(emptyMessage);
      return;
    }

    const recognition = new recognitionConstructor();
    recognition.lang = "es-ES";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const spokenText = event.results[0]?.[0]?.transcript ?? "";
      resolveRequest(spokenText);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setMessage(errorMessageForSpeechRecognition(event.error));
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function submitTextRequest(text: string) {
    resolveRequest(text);
  }

  function choosePendingOption(matchId: number) {
    const option = pendingOptions.find((item) => item.matchId === matchId);
    if (!option) {
      return;
    }
    setPendingOptions([]);
    onSelectMatch(matchId);
    setMessage(`Partido seleccionado: ${option.label}.`);
  }

  function speakCurrentAnalysis() {
    speak(buildSpokenSummary(selectedInsight), true);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      speechRunRef.current += 1;
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }

  function resumeSpeaking() {
    if (speechSegments.length === 0) {
      return;
    }
    speakSegments(speechSegments, currentSpeechSegment);
  }

  function previousSpeechSegment() {
    const previous = Math.max(currentSpeechSegment - 1, 0);
    seekSpeechSegment(previous);
  }

  function nextSpeechSegment() {
    const next = Math.min(currentSpeechSegment + 1, speechSegments.length - 1);
    seekSpeechSegment(next);
  }

  function seekSpeechSegment(index: number) {
    if (speechSegments.length === 0) {
      return;
    }
    const safeIndex = Math.min(Math.max(index, 0), speechSegments.length - 1);
    if (isSpeaking) {
      speakSegments(speechSegments, safeIndex);
    } else {
      setCurrentSpeechSegment(safeIndex);
    }
  }

  function resolveRequest(text: string) {
    const spokenText = text.trim();
    if (!spokenText) {
      setMessage("No he recibido ningun texto de partido.");
      return;
    }
    setTranscript(spokenText);
    setPendingOptions([]);
    const result = resolveMatchFromSpeech(spokenText, matches);
    if (result.status === "found") {
      onSelectMatch(result.match.id);
      setMessage(`Partido encontrado: ${displaySpokenTeamName(result.match.home_team)} vs ${displaySpokenTeamName(result.match.away_team)}.`);
    } else if (result.status === "ambiguous") {
      setPendingOptions(result.options);
      setMessage(result.message);
      speak(result.message);
    } else {
      setMessage("No encontre ese partido entre los partidos cargados.");
      speak("No encontre ese partido entre los partidos cargados.");
    }
  }

  function speak(text: string, withControls = false) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setMessage("Este navegador no admite sintesis de voz.");
      return;
    }
    if (withControls) {
      const segments = splitSpokenText(text);
      setSpeechSegments(segments);
      speakSegments(segments, 0);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function speakSegments(segments: string[], startIndex: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || segments.length === 0) {
      return;
    }

    speechRunRef.current += 1;
    const runId = speechRunRef.current;
    const index = Math.min(Math.max(startIndex, 0), segments.length - 1);
    window.speechSynthesis.cancel();
    setCurrentSpeechSegment(index);
    setIsSpeaking(true);

    const utterance = new SpeechSynthesisUtterance(segments[index]);
    utterance.lang = "es-ES";
    utterance.rate = 0.9;
    utterance.onend = () => {
      if (speechRunRef.current !== runId) {
        return;
      }
      const nextIndex = index + 1;
      if (nextIndex < segments.length) {
        speakSegments(segments, nextIndex);
      } else {
        setIsSpeaking(false);
      }
    };
    utterance.onerror = () => {
      if (speechRunRef.current === runId) {
        setIsSpeaking(false);
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  return {
    isSupported,
    isListening,
    isSpeaking,
    transcript,
    message,
    pendingOptions,
    speechSegments,
    currentSpeechSegment,
    currentSpeechText,
    speechDigest,
    startListening,
    stopListening,
    submitTextRequest,
    choosePendingOption,
    speakCurrentAnalysis,
    stopSpeaking,
    resumeSpeaking,
    previousSpeechSegment,
    nextSpeechSegment,
    seekSpeechSegment,
  };
}

function splitSpokenText(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function summarizeSpeechSegments(segments: string[]) {
  return segments.map((segment) => {
    const clean = segment.replace(/\s+/g, " ").trim();
    if (clean.length <= 96) {
      return clean;
    }
    return `${clean.slice(0, 93).trim()}...`;
  });
}

function errorMessageForSpeechRecognition(error?: string) {
  const messages: Record<string, string> = {
    "audio-capture": "No detecto ningun microfono disponible en este navegador.",
    "not-allowed": "El navegador no tiene permiso para usar el microfono.",
    "service-not-allowed": "El servicio de reconocimiento de voz esta bloqueado en este navegador.",
    network: "El reconocimiento de voz del navegador no pudo conectar con su servicio.",
    "no-speech": "No detecte voz. Prueba a hablar mas cerca del microfono o usa el campo de texto.",
    aborted: "La escucha se cancelo antes de recibir la peticion.",
  };
  return messages[error ?? ""] ?? `No pude escuchar bien la peticion${error ? ` (${error})` : ""}.`;
}
