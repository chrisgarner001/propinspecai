'use client'

import { useEffect, useRef, useState } from 'react'

// Web Speech API has no TypeScript lib types and only ships as a vendor-
// prefixed global in Chromium browsers; declared loosely and feature-detected
// at runtime rather than pulling in a typings package for one optional button.
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  onresult: ((event: any) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

export default function SpecialInstructionsField({
  name,
  placeholder,
  defaultValue,
}: {
  name: string
  placeholder: string
  defaultValue?: string
}) {
  const [value, setValue] = useState(defaultValue ?? '')
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupported(!!SpeechRecognition)
    return () => recognitionRef.current?.stop()
  }, [])

  function toggleListening() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const recognition: SpeechRecognitionLike = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript
      }
      if (finalTranscript.trim()) {
        setValue((prev) => (prev ? `${prev.trim()} ${finalTranscript.trim()}` : finalTranscript.trim()))
      }
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setListening(true)
  }

  return (
    <div className="relative">
      <textarea
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={5}
        className="border border-border rounded-[var(--radius-sm)] px-2.5 py-2 pr-11 w-full bg-surface text-[13px] leading-relaxed placeholder:text-text-muted placeholder:italic resize-y"
      />
      {supported && (
        <button
          type="button"
          onClick={toggleListening}
          title={listening ? 'Stop voice input' : 'Start voice input'}
          aria-pressed={listening}
          className={`absolute top-2 right-2 w-7 h-7 rounded-full border text-[13px] leading-none flex items-center justify-center ${
            listening
              ? 'bg-accent border-accent text-white'
              : 'bg-surface border-border text-text-muted hover:text-accent hover:border-accent'
          }`}
        >
          🎤
        </button>
      )}
    </div>
  )
}
