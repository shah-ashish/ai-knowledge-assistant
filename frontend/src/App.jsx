import React, { useState, useEffect, useRef } from 'react';
import {
  FiUploadCloud,
  FiFileText,
  FiTrash2,
  FiSend,
  FiBookOpen,
  FiAlertTriangle,
  FiCheckCircle,
  FiMessageCircle,
  FiLayers,
  FiChevronRight,
} from 'react-icons/fi';
import { uploadDocument, sendChatMessageStream, resetSession } from './services/api';
import './App.css';

/* ─── Avatar: simple initials-style human avatar ─── */
function AssistantAvatar({ size = 32 }) {
  return (
    <div
      style={{ width: size, height: size, minWidth: size }}
      className="rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-sm"
    >
      <span style={{ fontSize: size * 0.4, lineHeight: 1 }} className="text-white font-semibold select-none">
        K
      </span>
    </div>
  );
}

/* ─── Markdown renderer ─── */
function MessageContent({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  return (
    <div style={{ lineHeight: 1.7 }}>
      {lines.map((line, idx) => {
        let html = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');

        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          return (
            <li
              key={idx}
              className="list-disc ml-5 mt-0.5 text-[0.875rem]"
              dangerouslySetInnerHTML={{ __html: html.trim().substring(2) }}
            />
          );
        }
        if (/^\d+\.\s/.test(line.trim())) {
          return (
            <li
              key={idx}
              className="list-decimal ml-5 mt-0.5 text-[0.875rem]"
              dangerouslySetInnerHTML={{ __html: html.trim().replace(/^\d+\.\s/, '') }}
            />
          );
        }
        return (
          <p
            key={idx}
            className="min-h-[1.2em] text-[0.875rem]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}

/* ─── Sidebar ─── */
function Sidebar({ docMeta, onReset }) {
  return (
    <aside
      className="hidden md:flex flex-col gap-5 p-5 flex-shrink-0"
      style={{
        width: 270,
        borderRight: '1px solid #e7e5e4',
        background: '#ffffff',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 pb-4" style={{ borderBottom: '1px solid #e7e5e4' }}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-sm">
          <FiMessageCircle className="text-white" size={17} />
        </div>
        <div>
          <p className="font-semibold text-stone-800 text-sm leading-tight">Knowledge</p>
          <p className="text-stone-400 text-xs">Document Assistant</p>
        </div>
      </div>

      {/* Document card */}
      {docMeta ? (
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
            Active Document
          </p>
          <div className="doc-card">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="mt-0.5 w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                <FiFileText className="text-violet-600" size={14} />
              </div>
              <div className="min-w-0">
                <p
                  className="text-stone-800 font-medium text-sm leading-tight truncate"
                  title={docMeta.filename}
                >
                  {docMeta.filename}
                </p>
                <p className="text-stone-500 text-xs mt-0.5">PDF Document</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-lg px-2.5 py-2 text-center" style={{ border: '1px solid #ddd6fe' }}>
                <p className="text-violet-700 font-bold text-base leading-none">{docMeta.pagesCount}</p>
                <p className="text-stone-500 text-[10px] mt-0.5">Pages</p>
              </div>
              <div className="bg-white rounded-lg px-2.5 py-2 text-center" style={{ border: '1px solid #ddd6fe' }}>
                <p className="text-violet-700 font-bold text-base leading-none">{docMeta.chunksCount}</p>
                <p className="text-stone-500 text-[10px] mt-0.5">Chunks</p>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 mt-3 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-xs text-stone-500">Indexed & ready</span>
          </div>

          {/* Reset */}
          <button onClick={onReset} className="btn-danger w-full mt-4">
            <FiTrash2 size={12} />
            Clear Document
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
            How it works
          </p>
          <div className="space-y-3">
            {[
              { icon: FiUploadCloud, label: 'Upload a PDF', desc: 'Any document up to 20 MB' },
              { icon: FiLayers, label: 'Auto-indexed', desc: 'Chunked & embedded for search' },
              { icon: FiMessageCircle, label: 'Ask questions', desc: 'Get cited, grounded answers' },
            ].map(({ icon: Icon, label, desc }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={13} className="text-stone-500" />
                </div>
                <div>
                  <p className="text-stone-700 text-sm font-medium leading-tight">{label}</p>
                  <p className="text-stone-400 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-4" style={{ borderTop: '1px solid #e7e5e4' }}>
        <p className="text-[11px] text-stone-400 leading-relaxed">
          Your document is indexed in memory only — it is never stored or logged.
        </p>
      </div>
    </aside>
  );
}

/* ─── Main app ─── */
export default function App() {
  const [sessionId, setSessionId] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [docMeta, setDocMeta] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  /* Session init */
  useEffect(() => {
    let sid = sessionStorage.getItem('rag_session_id');
    if (!sid) {
      sid = 'session_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      sessionStorage.setItem('rag_session_id', sid);
    }
    setSessionId(sid);
    const storedMeta = sessionStorage.getItem('rag_doc_meta');
    if (storedMeta) setDocMeta(JSON.parse(storedMeta));
  }, []);

  /* Auto-scroll */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  /* File handlers */
  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) validateAndUpload(f);
  };

  const validateAndUpload = async (f) => {
    setErrorMsg('');
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Please upload a PDF document.');
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setErrorMsg('File too large — maximum 20 MB.');
      return;
    }
    setFile(f);
    await uploadFileToServer(f);
  };

  const uploadFileToServer = async (fileToUpload) => {
    setUploading(true);
    setUploadStatus('Reading pages & building search index…');
    try {
      const data = await uploadDocument(fileToUpload, sessionId);
      const meta = {
        filename: data.filename,
        pagesCount: data.pagesCount,
        chunksCount: data.chunksCount,
      };
      setDocMeta(meta);
      sessionStorage.setItem('rag_doc_meta', JSON.stringify(meta));
      setUploadStatus('');
      setMessages([{
        role: 'assistant',
        content: `I've read **${data.filename}** and built a search index across ${data.pagesCount} pages.\n\n**Here's a quick overview:**\n${data.summary || 'Ask me anything about this document.'}`,
        isSystem: true,
      }]);
    } catch (err) {
      setErrorMsg(err.message || 'Could not process the document. Please try again.');
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndUpload(f);
  };

  /* Chat */
  const handleSendQuestion = async (e) => {
    e.preventDefault();
    if (!inputQuestion.trim() || chatLoading || !docMeta) return;

    const userMsg = inputQuestion.trim();
    setInputQuestion('');
    setErrorMsg('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      await sendChatMessageStream(
        userMsg,
        sessionId,
        (meta) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, citations: meta.citations, confidence: meta.confidence }];
            }
            return [...prev, { role: 'assistant', content: '', citations: meta.citations, confidence: meta.confidence }];
          });
        },
        (delta) => {
          setChatLoading(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
            }
            return [...prev, { role: 'assistant', content: delta, citations: [], confidence: '' }];
          });
        }
      );
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  /* Reset */
  const handleReset = async () => {
    if (!window.confirm('Remove the current document and clear chat history?')) return;
    setErrorMsg('');
    try { await resetSession(sessionId); } catch { }
    setFile(null);
    setDocMeta(null);
    setMessages([]);
    setInputQuestion('');
    sessionStorage.removeItem('rag_doc_meta');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* Keyboard shortcut: Enter to send, Shift+Enter for newline */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion(e);
    }
  };

  /* ─── Render ─── */
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f4' }}>

      {/* ── Mobile-only top bar (sidebar is hidden on small screens) ── */}
   {/* ── Mobile-only top bar (sidebar is hidden on small screens) ── */}
<header
  className="flex md:hidden"
  style={{
    borderBottom: '1px solid #e7e5e4',
    background: '#ffffff',
    height: 52,
    flexShrink: 0,
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    gap: 10,
    zIndex: 30,
  }}
>
  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
    <FiMessageCircle className="text-white" size={14} />
  </div>

  <span
    className="font-semibold text-stone-800"
    style={{ fontSize: '0.875rem' }}
  >
    Knowledge Assistant
  </span>

  {docMeta && (
    <>
      <div
        className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-violet-700"
        style={{
          background: '#ede9fe',
          border: '1px solid #ddd6fe',
          maxWidth: 160,
        }}
      >
        <FiFileText size={11} />
        <span className="truncate">
          {docMeta.filename}
        </span>
      </div>

      <button
        onClick={handleReset}
        className="btn-danger"
        style={{
          padding: '0.4rem 0.6rem',
          flexShrink: 0,
        }}
      >
        <FiTrash2 size={12} />
      </button>
    </>
  )}
</header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <Sidebar docMeta={docMeta} onReset={handleReset} />

        {/* ── Main column ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!docMeta ? (
            /* ── Upload screen ── */
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
              }}
            >
              <div style={{ maxWidth: 480, width: '100%' }}>

                {/* Heading */}
                <div className="text-center mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <FiBookOpen className="text-white" size={24} />
                  </div>
                  <h1 className="text-2xl font-bold text-stone-800 mb-2">
                    Upload your document
                  </h1>
                  <p className="text-stone-500 text-sm leading-relaxed">
                    Drop in any PDF and I'll read it, index it, and answer your questions with page-level citations.
                  </p>
                </div>

                {/* Error */}
                {errorMsg && (
                  <div
                    className="flex items-start gap-2.5 text-sm mb-4 p-3 rounded-xl"
                    style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c' }}
                  >
                    <FiAlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Drop zone */}
                <div
                  className={`drop-zone${dragOver ? ' drag-over' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  style={{
                    minHeight: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 32,
                    cursor: uploading ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf"
                    className="hidden"
                  />

                  {uploading ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="spinner" />
                      <div className="text-center">
                        <p className="text-stone-700 font-medium text-sm">{uploadStatus}</p>
                        <p className="text-stone-400 text-xs mt-1">This takes a few seconds…</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: '#f5f5f4', border: '1px solid #e7e5e4' }}
                      >
                        <FiUploadCloud size={22} className="text-stone-400" />
                      </div>
                      <div>
                        <p className="text-stone-700 font-medium text-sm">
                          Drag & drop your PDF here
                        </p>
                        <p className="text-stone-400 text-xs mt-1">or click to browse — max 20 MB</p>
                      </div>
                      <span
                        className="text-xs font-medium px-3 py-1 rounded-full"
                        style={{ background: '#f5f5f4', color: '#78716c', border: '1px solid #e7e5e4' }}
                      >
                        PDF only
                      </span>
                    </div>
                  )}
                </div>

                {/* Trust note */}
                <div className="flex items-center justify-center gap-2 mt-5 text-stone-400" style={{ fontSize: '0.75rem' }}>
                  <FiCheckCircle size={12} className="text-emerald-500" />
                  <span>Your file is never stored — it lives in memory for this session only.</span>
                </div>
              </div>
            </div>

          ) : (
            /* ── Chat screen ── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Messages area */}
              <div
                className="no-scrollbar"
                style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}
              >
                {messages.map((msg, index) => {
                  if (msg.role === 'assistant' && !msg.content) return null;

                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={index}
                      className="msg-enter"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isUser ? 'flex-end' : 'flex-start',
                        gap: 6,
                      }}
                    >
                      {/* Avatar row */}
                      {!isUser && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <AssistantAvatar size={28} />
                          <span style={{ fontSize: '0.75rem', color: '#78716c', fontWeight: 500 }}>
                            Knowledge Assistant
                          </span>
                        </div>
                      )}

                      {/* Bubble */}
                      <div className={isUser ? 'bubble-user' : 'bubble-assistant'}>
                        <MessageContent content={msg.content} />
                      </div>

                      {/* Citations & confidence */}
                      {!isUser && !msg.isSystem && (msg.confidence || (msg.citations && msg.citations.length > 0)) && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 6,
                            paddingLeft: 36,
                          }}
                        >
                          {msg.confidence && (
                            <span
                              className={`confidence-badge ${msg.confidence === 'High' ? 'badge-high' :
                                msg.confidence === 'Medium' ? 'badge-medium' : 'badge-low'
                                }`}
                            >
                              {msg.confidence} match
                            </span>
                          )}
                          {msg.citations && msg.citations.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <FiBookOpen size={11} color="#a8a29e" />
                              {msg.citations.map((cit, cIdx) => (
                                <span key={cIdx} className="citation-chip">p. {cit.page}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {chatLoading && (
                  <div className="msg-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AssistantAvatar size={28} />
                      <span style={{ fontSize: '0.75rem', color: '#78716c', fontWeight: 500 }}>Knowledge Assistant</span>
                    </div>
                    <div className="bubble-assistant" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.75rem 1rem' }}>
                      {[0, 0.2, 0.4].map((delay, i) => (
                        <div
                          key={i}
                          className="dot-typing"
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: '#c4b5fd',
                            animationDelay: `${delay}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Error */}
                {errorMsg && (
                  <div
                    className="flex items-start gap-2.5 text-sm p-3 rounded-xl"
                    style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c' }}
                  >
                    <FiAlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Empty state hint */}
                {messages.length === 1 && !chatLoading && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 8 }}>
                    {['What is this document about?', 'Summarize the key points', 'What are the main conclusions?'].map((hint) => (
                      <button
                        key={hint}
                        onClick={() => setInputQuestion(hint)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0.5rem 0.875rem',
                          borderRadius: '2rem',
                          border: '1px solid #e7e5e4',
                          background: '#ffffff',
                          color: '#57534e',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          fontFamily: 'Inter, sans-serif',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = '#c4b5fd'; e.currentTarget.style.color = '#6d28d9'; }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e7e5e4'; e.currentTarget.style.color = '#57534e'; }}
                      >
                        <FiChevronRight size={12} />
                        {hint}
                      </button>
                    ))}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* ── Input bar ── */}
              <form
                onSubmit={handleSendQuestion}
                style={{
                  padding: '12px 20px 16px',
                  borderTop: '1px solid #e7e5e4',
                  background: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <input
                  type="text"
                  value={inputQuestion}
                  onChange={(e) => setInputQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about this document…"
                  disabled={chatLoading}
                  className="field-input"
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  disabled={!inputQuestion.trim() || chatLoading}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '0.75rem',
                    border: 'none',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: (!inputQuestion.trim() || chatLoading) ? 'not-allowed' : 'pointer',
                    background: (!inputQuestion.trim() || chatLoading) ? '#e7e5e4' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    color: (!inputQuestion.trim() || chatLoading) ? '#a8a29e' : '#ffffff',
                    boxShadow: (!inputQuestion.trim() || chatLoading) ? 'none' : '0 2px 8px rgba(109,40,217,0.3)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <FiSend size={16} />
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
