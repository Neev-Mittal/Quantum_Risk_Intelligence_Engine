import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, MessageSquare, Minimize2, SendHorizonal, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const routeMeta = {
  '/': {
    title: 'Home Dashboard',
  },
  '/asset-inventory': {
    title: 'Asset Inventory',
  },
  '/asset-discovery': {
    title: 'Asset Discovery',
  },
  '/cbom': {
    title: 'CBOM',
  },
  '/posture-pqc': {
    title: 'Posture of PQC',
  },
  '/cyber-rating': {
    title: 'Cyber Rating',
  },
  '/reporting': {
    title: 'Reporting',
  },
  '/business-impact': {
    title: 'Business Impact',
  },
  '/scanner': {
    title: 'Scanner Engine',
  },
}

function buildWelcomeMessage(pageTitle, firstName) {
  const name = firstName || 'operator'
  return `Hello! I can help you navigate QRIE, explain security metrics, and summarize what you are seeing on ${pageTitle}.`
}

export default function ChatbotWidget({ currentUser }) {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef(null)
  const firstName = currentUser?.name?.split(' ')?.[0]
  const pathname = location.pathname

  const pageContext = useMemo(() => {
    return routeMeta[pathname] || {
      title: 'QRIE Workspace',
    }
  }, [pathname])

  useEffect(() => {
    setMessages((current) => {
      if (current.length > 0) {
        return current
      }

      return [
        {
          role: 'assistant',
          content: buildWelcomeMessage(pageContext.title, firstName),
        },
      ]
    })
  }, [pageContext.title, firstName])

  useEffect(() => {
    if (!scrollRef.current) {
      return
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isLoading, error])

  const sendMessage = async (rawMessage) => {
    const trimmed = rawMessage.trim()
    if (!trimmed || isLoading) {
      return
    }

    const nextMessages = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages.slice(-8),
          route: pathname,
          page_title: pageContext.title,
          user_name: currentUser?.name || currentUser?.username || 'Operator',
          user_role: currentUser?.role || 'unknown',
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.message || 'Unable to get a response from QRIE Copilot.')
      }

      setMessages((current) => [...current, { role: 'assistant', content: data.message }])
    } catch (err) {
      setError(err.message || 'Unable to reach QRIE Copilot right now.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-[90]">
      {isOpen ? (
        <div className="glass-card flex h-[min(82vh,680px)] w-[min(92vw,390px)] min-h-0 flex-col overflow-hidden rounded-[28px] border border-amber-200/80 shadow-[0_24px_60px_rgba(92,0,0,0.22)] max-sm:h-[min(88vh,720px)]">
          <div className="bg-gradient-to-r from-pnb-crimson via-red-800 to-pnb-darkred px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
                    <Bot size={20} className="text-amber-200" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold uppercase tracking-[0.18em]">QRIE Copilot</p>
                    <p className="text-xs text-amber-100/90">{pageContext.title}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-6 text-amber-50/90">
                  Ask for page guidance, scanner help, reporting recommendations, or security summaries.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white/90 transition-colors hover:bg-white/15"
                  aria-label="Minimize chatbot"
                >
                  <Minimize2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white/90 transition-colors hover:bg-white/15"
                  aria-label="Close chatbot"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white/80 px-4 py-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-pnb-crimson to-red-800 text-white'
                      : 'border border-amber-100 bg-amber-50/80 text-slate-700'
                  }`}
                >
                  <p className="mb-1 font-display text-[10px] uppercase tracking-[0.2em] opacity-75">
                    {message.role === 'user' ? 'You' : 'QRIE Copilot'}
                  </p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-slate-600 shadow-sm">
                  <p className="mb-1 font-display text-[10px] uppercase tracking-[0.2em] text-pnb-crimson/70">QRIE Copilot</p>
                  <p>Thinking through your request...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-amber-100 bg-white/90 p-4">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                sendMessage(input)
              }}
              className="space-y-3"
            >
              <div className="rounded-[24px] border border-amber-200 bg-amber-50/70 px-3 py-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={`Ask about ${pageContext.title.toLowerCase()}...`}
                  rows={2}
                  className="w-full resize-none bg-transparent text-sm leading-6 text-slate-800 placeholder:text-slate-400 focus:outline-none"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      sendMessage(input)
                    }
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pnb-crimson to-red-800 px-4 py-3 font-display text-sm font-semibold tracking-wide text-white transition-all duration-300 hover:from-red-800 hover:to-pnb-crimson disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SendHorizonal size={15} />
                Send To QRIE Copilot
              </button>
            </form>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-3 rounded-full bg-gradient-to-r from-pnb-crimson to-red-800 px-5 py-4 text-white shadow-[0_18px_40px_rgba(92,0,0,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:from-red-800 hover:to-pnb-crimson"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/12">
            <MessageSquare size={20} className="text-amber-200" />
          </div>
          <div className="text-left">
            <p className="font-display text-xs uppercase tracking-[0.22em] text-amber-200">AI Assistant</p>
            <p className="text-sm font-semibold text-white">Open QRIE Copilot</p>
          </div>
        </button>
      )}
    </div>
  )
}
