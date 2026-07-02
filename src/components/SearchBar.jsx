import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Mic, Volume2, MicOff } from 'lucide-react'
import { toast } from 'sonner'
import { findVoiceMatches } from '../lib/voiceMatch'

function pluralize(name) {
  return /s$/i.test(name) ? name : `${name}s`
}

function buildSpokenAnswer(query, matches) {
  if (matches.length === 0) {
    return `माफ़ कीजिए, "${query}" से मिलता-जुलता कुछ नहीं मिला।`
  }
  const top = matches[0]
  const locs = top.item_locations ?? []
  const total = locs.reduce((s, l) => s + (l.quantity || 0), 0)

  let locationLine
  if (locs.length === 0) {
    locationLine = 'इसकी अभी कोई लोकेशन दर्ज नहीं है।'
  } else {
    const parts = locs.map(
      (l) => `${l.locations?.label || 'अज्ञात जगह'} पर ${l.quantity}`
    )
    locationLine = `यह ${parts.join(', और ')} मौजूद है।`
  }

  const intro =
    matches.length === 1
      ? `${top.name}.`
      : `"${query}" से मिलते-जुलते ${matches.length} आइटम मिले। सबसे करीबी मैच है ${top.name}.`

  return `${intro} कुल ${total} यूनिट उपलब्ध हैं। ${locationLine}`
}

export default function SearchBar({ items, query, setQuery }) {
  const [focused, setFocused] = useState(false)
  const [voiceState, setVoiceState] = useState('idle') // idle | listening | speaking
  const recognitionRef = useRef(null)
  const supportsVoice = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 6)
  }, [query, items])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  function speak(text) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'hi-IN'
    utterance.rate = 0.98
    utterance.onend = () => setVoiceState('idle')
    utterance.onerror = () => setVoiceState('idle')
    setVoiceState('speaking')
    window.speechSynthesis.speak(utterance)
  }

  function handleVoiceQuery(transcript) {
    const matches = findVoiceMatches(transcript, items)
    // Resolve to the matched item's real (English) name so the rest of the
    // app's plain substring search — the results grid, suggestions list —
    // also finds it, instead of leaving the raw Hindi transcript in the box.
    setQuery(matches.length > 0 ? matches[0].name : transcript)
    speak(buildSpokenAnswer(transcript, matches))
  }

  function startListening() {
    if (!supportsVoice) {
      toast.error('इस ब्राउज़र में वॉइस सर्च सपोर्ट नहीं है। Chrome या Edge आज़माएँ।')
      return
    }
    if (voiceState === 'listening') {
      recognitionRef.current?.stop()
      setVoiceState('idle')
      return
    }
    if (voiceState === 'speaking') {
      window.speechSynthesis?.cancel()
      setVoiceState('idle')
      return
    }

    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognitionImpl()
    recognition.lang = 'hi-IN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setVoiceState('listening')
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      handleVoiceQuery(transcript)
    }
    recognition.onerror = () => {
      setVoiceState('idle')
      toast.error('सुन नहीं पाया — दोबारा कोशिश करें।')
    }
    recognition.onend = () => {
      setVoiceState((s) => (s === 'listening' ? 'idle' : s))
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="text"
        placeholder={voiceState === 'listening' ? 'सुन रहा हूँ…' : 'Search inventory by name, SKU, or brand…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        className={`w-full rounded-xl border bg-surface py-3 pl-10 pr-11 text-[13.5px] text-text shadow-card outline-none transition-colors placeholder:text-muted focus:border-accent sm:py-2.5 ${
          voiceState === 'listening' ? 'border-accent' : 'border-border'
        }`}
      />
      <button
        type="button"
        onClick={startListening}
        title={
          !supportsVoice
            ? 'इस ब्राउज़र में वॉइस सर्च सपोर्ट नहीं है'
            : voiceState === 'listening'
            ? 'सुनना बंद करें'
            : voiceState === 'speaking'
            ? 'बोलना रोकें'
            : 'आवाज़ से खोजें'
        }
        className={`absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg transition-colors sm:right-2.5 sm:h-7 sm:w-7 ${
          voiceState === 'listening'
            ? 'animate-pulse bg-danger text-white'
            : voiceState === 'speaking'
            ? 'bg-accent text-white'
            : 'text-muted hover:bg-accent-soft hover:text-accent'
        } ${!supportsVoice ? 'cursor-not-allowed opacity-40' : ''}`}
      >
        {voiceState === 'listening' ? (
          <MicOff size={15} />
        ) : voiceState === 'speaking' ? (
          <Volume2 size={15} />
        ) : (
          <Mic size={15} />
        )}
      </button>
      {focused && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1.5 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-card-hover animate-fade-in">
          {suggestions.map((item) => (
            <li
              key={item.id}
              onMouseDown={() => setQuery(item.name)}
              className="cursor-pointer rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-accent-soft hover:text-accent"
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
