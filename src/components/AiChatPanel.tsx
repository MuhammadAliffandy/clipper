import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, MessageSquare } from 'lucide-react';
import { type ChatMessage } from '../lib/api';

interface AiChatPanelProps {
  niche?: string;
  onSendMessage: (message: string, history: ChatMessage[]) => Promise<string>;
}

export const AiChatPanel: React.FC<AiChatPanelProps> = ({ niche, onSendMessage }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: `Hey! I've analyzed this ${niche || 'video'}. Ask me anything — best clips, captions, hashtags, or what the video is about! 🎬` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: input };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    try {
      const reply = await onSendMessage(input, messages);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had an error. Make sure Ollama is running! 🦙' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = ['What are the best 30s clips?', 'Write a viral caption', 'Suggest hashtags', 'What is this video about?'];

  return (
    <div className="panel-section" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="panel-section-title">
        <MessageSquare size={14} />
        AI Video Chat
      </div>

      {/* Chat messages */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxHeight: 340,
        overflowY: 'auto',
        marginBottom: 12,
        paddingRight: 4
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
          }}>
            <div style={{
              width: 28, height: 28,
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
                : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              fontSize: 12
            }}>
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div style={{
              background: msg.role === 'user' ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: msg.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
              padding: '10px 13px',
              fontSize: '0.82rem',
              color: 'rgba(255,255,255,0.88)',
              lineHeight: 1.55,
              maxWidth: '82%',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Bot size={14} />
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px 14px 14px 14px',
              padding: '10px 14px',
              display: 'flex', gap: 4, alignItems: 'center'
            }}>
              {[0, 1, 2].map(j => (
                <div key={j} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#8b5cf6',
                  animation: `bounce 1s ${j * 0.2}s infinite`
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {quickPrompts.map(q => (
            <button
              key={q}
              onClick={() => { setInput(q); }}
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 99,
                color: 'rgba(255,255,255,0.65)',
                fontSize: '0.72rem',
                padding: '5px 11px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="chat-input"
          type="text"
          placeholder="Ask about this video..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12,
            color: 'white',
            padding: '10px 14px',
            fontSize: '0.85rem',
            outline: 'none'
          }}
          disabled={isLoading}
        />
        <button
          id="btn-send-chat"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          style={{
            background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
            border: 'none',
            borderRadius: 12,
            color: 'white',
            width: 42,
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            opacity: (!input.trim() || isLoading) ? 0.5 : 1
          }}
        >
          {isLoading ? <Loader2 size={16} className="btn-spinner" /> : <Send size={16} />}
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
};
