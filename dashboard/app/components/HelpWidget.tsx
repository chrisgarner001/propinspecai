'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { askHelp } from '@/app/actions'

type Message = { role: 'user' | 'assistant'; content: string }

// Bottom-left, fixed to the viewport (not the AppShell box, which can sit
// narrower/centered on wide screens) -- present via AppShell so it's on
// every page automatically, same mount point as the nav rail. See
// docs/designs/ai-help-widget.md: sends the current pathname on every
// question so lib/helpContext.ts can match real page data into the answer.
export default function HelpWidget() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const pathname = usePathname()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, isPending])

  function handleAsk() {
    const q = question.trim()
    if (!q) return
    setError(null)
    const history = messages
    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setQuestion('')
    startTransition(async () => {
      const result = await askHelp(pathname, q, history)
      if (result.error) {
        setError(result.error)
        return
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: result.answer ?? '' }])
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !isPending) handleAsk()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Help"
        className="fixed bottom-4 left-4 z-50 w-11 h-11 rounded-full bg-accent hover:bg-accent-hover text-white font-display font-bold text-[16px] shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
      >
        ?
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] border border-border rounded-[var(--radius-md)] bg-surface shadow-[0_4px_16px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-alt">
        <span className="text-[13px] font-semibold">Help</span>
        <button type="button" onClick={() => setOpen(false)} className="text-text-muted hover:text-text text-[16px] leading-none">
          ×
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 max-h-80 min-h-[8rem]">
        {messages.length === 0 && (
          <div className="text-[12px] text-text-muted">
            Ask how to use this page, or ask about the data in front of you -- e.g. &quot;why is this total $80?&quot;
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-[12px] rounded-[var(--radius-sm)] px-2 py-1.5 whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-accent-bg text-accent-ink ml-6' : 'bg-surface-alt mr-6'
            }`}
          >
            {m.content}
          </div>
        ))}
        {isPending && <div className="text-[12px] text-text-muted mr-6">Thinking…</div>}
        {error && <div className="text-[12px] text-error">{error}</div>}
      </div>

      <div className="flex items-center gap-1.5 p-2 border-t border-border">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          placeholder="Ask a question…"
          className="flex-1 text-[12px] border border-border rounded-[var(--radius-sm)] px-2 py-1.5 bg-surface disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleAsk}
          disabled={isPending || !question.trim()}
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        >
          Ask
        </button>
      </div>
    </div>
  )
}
