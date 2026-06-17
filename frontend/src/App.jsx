import React, { useState, useEffect, useRef } from 'react';
import { 
  FiUploadCloud, 
  FiFileText, 
  FiTrash2, 
  FiSend, 
  FiBookOpen, 
  FiAlertTriangle, 
  FiCheckCircle,
  FiCpu,
  FiMessageSquare
} from 'react-icons/fi';
import { uploadDocument, sendChatMessage, sendChatMessageStream, resetSession } from './services/api';
import './App.css';

export default function App() {
  const [sessionId, setSessionId] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [docMeta, setDocMeta] = useState(null); // { filename, pagesCount, chunksCount }
  
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // 1. Generate tab-isolated session ID
  useEffect(() => {
    let sid = sessionStorage.getItem('rag_session_id');
    if (!sid) {
      sid = 'session_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      sessionStorage.setItem('rag_session_id', sid);
    }
    setSessionId(sid);
    
    // Recover document metadata state if session exists in storage
    const storedMeta = sessionStorage.getItem('rag_doc_meta');
    if (storedMeta) {
      setDocMeta(JSON.parse(storedMeta));
    }
  }, []);

  // 2. Keep chat bottom-aligned
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  // 3. File upload and verification
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) validateAndUpload(selectedFile);
  };

  const validateAndUpload = async (selectedFile) => {
    setErrorMsg('');
    
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Invalid file format. Please upload a PDF document.');
      return;
    }

    const maxSize = 20 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      setErrorMsg('File too large. Maximum size allowed is 20 MB.');
      return;
    }

    setFile(selectedFile);
    await uploadFileToServer(selectedFile);
  };

  const uploadFileToServer = async (fileToUpload) => {
    setUploading(true);
    setUploadStatus('Extracting text & generating index...');
    
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
      
      // Seed initial helpful outline summary in chat thread
      setMessages([
        {
          role: 'model',
          content: `**Document summary successfully compiled.**\n\n**Document Outline:**\n${data.summary || 'Ask me any questions about the content below!'}`,
          isSystem: true
        }
      ]);
    } catch (err) {
      setErrorMsg(err.message || 'Error processing document. Please check server connections.');
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) validateAndUpload(droppedFile);
  };

  // 4. Send chat message
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
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last && last.role === 'model') {
              const updatedLast = {
                ...last,
                citations: meta.citations,
                confidence: meta.confidence
              };
              return [...prev.slice(0, -1), updatedLast];
            } else {
              return [
                ...prev,
                {
                  role: 'model',
                  content: '',
                  citations: meta.citations,
                  confidence: meta.confidence
                }
              ];
            }
          });
        },
        (delta) => {
          setChatLoading(false);
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last && last.role === 'model') {
              const updatedLast = {
                ...last,
                content: last.content + delta
              };
              return [...prev.slice(0, -1), updatedLast];
            } else {
              return [
                ...prev,
                {
                  role: 'model',
                  content: delta,
                  citations: [],
                  confidence: ''
                }
              ];
            }
          });
        }
      );
    } catch (err) {
      setErrorMsg(err.message || 'Failed to generate answer. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  // 5. Reset Session
  const handleReset = async () => {
    if (window.confirm('Wipe current document index and chat history?')) {
      setErrorMsg('');
      try {
        await resetSession(sessionId);
      } catch (err) {
        console.warn('API reset failed, clearing client state anyway');
      }
      
      setFile(null);
      setDocMeta(null);
      setMessages([]);
      setInputQuestion('');
      sessionStorage.removeItem('rag_doc_meta');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 6. Rich-Text Markdown Parser
  const renderMessageContent = (content) => {
    if (!content) return null;
    const lines = content.split('\n');
    
    return (
      <div className="space-y-1">
        {lines.map((line, idx) => {
          let lineContent = line;
          
          // Bold matches **text**
          lineContent = lineContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          
          // Bullet points starting with - or *
          if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            const cleanText = lineContent.trim().substring(2);
            return (
              <li key={idx} className="list-disc ml-5 mt-0.5" dangerouslySetInnerHTML={{ __html: cleanText }} />
            );
          }
          
          // Numbered lists starting with digits.
          if (/^\d+\.\s/.test(line.trim())) {
            const cleanText = lineContent.trim().replace(/^\d+\.\s/, '');
            return (
              <li key={idx} className="list-decimal ml-5 mt-0.5" dangerouslySetInnerHTML={{ __html: cleanText }} />
            );
          }
          
          // Standard paragraphs
          return (
            <p key={idx} className="min-h-[1rem] leading-relaxed" dangerouslySetInnerHTML={{ __html: lineContent }} />
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-screen max-h-screen flex flex-col bg-dark-950 text-dark-100 overflow-hidden font-sans">
      
      {/* Sleek Top Navbar */}
      <header className="border-b border-dark-800 bg-dark-900 px-6 h-14 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          <img 
            src="https://img.icons8.com/color/96/artificial-intelligence.png" 
            alt="AI Logo" 
            className="w-8 h-8 object-contain"
          />
          <span className="font-semibold text-white text-sm tracking-wide">AI Knowledge Assistant</span>
        </div>
        
        {docMeta && (
          <div className="flex items-center gap-4">
            {/* Active Document Details */}
            <div className="hidden md:flex items-center gap-2 bg-dark-950 px-3 py-1 rounded-lg border border-dark-800 text-xs">
              <FiFileText className="text-brand-400" />
              <span className="text-white font-medium max-w-[200px] truncate" title={docMeta.filename}>
                {docMeta.filename}
              </span>
              <span className="text-dark-500">|</span>
              <span className="text-dark-400">{docMeta.pagesCount} Pages</span>
            </div>
            
            {/* Reset Button */}
            <button 
              onClick={handleReset}
              className="text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 px-3 py-1.5 rounded-lg border border-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FiTrash2 size={13} />
              Reset Document
            </button>
          </div>
        )}
      </header>

      {/* Main Container - strictly constrained to fit leftover screen space */}
      <main className="flex-grow flex flex-col overflow-hidden relative">
        
        {!docMeta ? (
          
          /* ================= INGESTION UPLOAD STAGE ================= */
          <div className="flex-grow flex flex-col justify-center items-center max-w-lg w-full mx-auto p-6 text-center select-none animate-float">
            <div className="mb-6 flex flex-col items-center">
              <img 
                src="https://img.icons8.com/color/96/artificial-intelligence.png" 
                alt="AI Logo" 
                className="w-16 h-16 object-contain mb-3"
              />
              <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
                Knowledge Ingestion
              </h1>
              <p className="text-dark-400 text-sm leading-relaxed">
                Upload your PDF file. The document will be chunked, embedded, and stored in server memory.
              </p>
            </div>

            {errorMsg && (
              <div className="w-full mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2 text-left">
                <FiAlertTriangle className="mt-0.5 text-rose-400 flex-shrink-0" size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full glass-panel p-8 cursor-pointer border border-dashed ${
                uploading ? 'border-brand-500/50 bg-dark-900/30' : 'border-dark-700 hover:border-brand-500/50 hover:bg-dark-905 transition-all'
              } flex flex-col items-center justify-center min-h-[220px]`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange}
                accept=".pdf"
                className="hidden"
              />

              {uploading ? (
                <div className="flex flex-col items-center">
                  <div className="relative w-12 h-12 mb-3 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-brand-500/10 border-t-brand-500 animate-spin"></div>
                    <FiUploadCloud size={20} className="text-brand-400 animate-bounce" />
                  </div>
                  <h3 className="text-white font-medium text-sm mb-0.5">Processing Document...</h3>
                  <p className="text-dark-500 text-xs">{uploadStatus}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-xl bg-dark-800 text-dark-400 flex items-center justify-center mb-3">
                    <FiUploadCloud size={22} />
                  </div>
                  <h3 className="text-white font-medium text-sm mb-0.5">Drag and drop your PDF here</h3>
                  <p className="text-dark-500 text-xs mb-3">or click to browse files</p>
                  <div className="text-[10px] text-dark-500 px-2 py-1 rounded bg-dark-950 border border-dark-800 uppercase tracking-wide font-medium">
                    PDF • Max 20 MB
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center gap-1.5 text-[11px] text-dark-500 font-medium">
              <FiCheckCircle size={13} className="text-brand-500/60" />
              Index remains strictly in-memory and wipes when tab closes.
            </div>
          </div>

        ) : (

          /* ================= CHAT STAGE ================= */
          <div className="flex-grow flex flex-col justify-between overflow-hidden max-w-4xl w-full mx-auto my-4 border border-dark-800 rounded-2xl bg-dark-900">
            
            {/* Scrollable Conversation Container */}
            <div className="flex-grow overflow-y-auto px-6 py-6 space-y-6 no-scrollbar">
              
              {messages.map((msg, index) => {
                if (msg.role === 'model' && !msg.content) {
                  return null;
                }
                return (
                  <div 
                    key={index}
                    className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
                  >
                  {/* Bubble content with custom Rich-Text Markdown rendering */}
                  <div className={`p-4 rounded-xl text-[14px] leading-relaxed select-text ${
                    msg.role === 'user' 
                      ? 'bg-brand-600 text-white rounded-tr-none' 
                      : 'bg-dark-900 text-dark-100 border border-dark-800 rounded-tl-none'
                  }`}>
                    {renderMessageContent(msg.content)}
                  </div>

                  {/* Sources Citations & Match confidence details */}
                  {!msg.isSystem && msg.role === 'model' && (
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-dark-400 pl-1 select-none">
                      
                      {msg.confidence && (
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          msg.confidence === 'High' 
                            ? 'bg-emerald-500/15 text-emerald-400' 
                            : msg.confidence === 'Medium'
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-orange-500/15 text-orange-400'
                        }`}>
                          {msg.confidence} Match
                        </span>
                      )}

                      {msg.citations && msg.citations.length > 0 && (
                        <div className="flex items-center gap-1 font-medium text-dark-400">
                          <FiBookOpen size={12} className="text-dark-500" />
                          <span>Sources:</span>
                          <div className="flex gap-1 flex-wrap">
                            {msg.citations.map((cit, cIdx) => (
                              <span 
                                key={cIdx} 
                                className="bg-dark-900 px-1.5 py-0.5 rounded border border-dark-800 text-dark-300 font-semibold text-[10px]"
                                title={cit.file}
                              >
                                Page {cit.page}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}

              {/* Typing loader */}
              {chatLoading && (
                <div className="self-start flex flex-col items-start gap-1 max-w-[80%] select-none">
                  <div className="bg-dark-900 border border-dark-800 p-4 rounded-xl rounded-tl-none flex items-center gap-1 px-5">
                    <div className="w-1.5 h-1.5 rounded-full bg-dark-400 dot-typing" style={{ animationDelay: '0s' }}></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-dark-400 dot-typing" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-dark-400 dot-typing" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              )}

              {/* Inline warning notification banner */}
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5 select-none">
                  <FiAlertTriangle className="mt-0.5 text-rose-400 flex-shrink-0" size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Bottom Input Area */}
            <form 
              onSubmit={handleSendQuestion}
              className="border-t border-dark-800 bg-dark-950 p-4 flex gap-3 items-center sticky bottom-0 z-20"
            >
              <input 
                type="text" 
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                placeholder="Ask a question about this document..."
                disabled={chatLoading}
                className="glass-input flex-grow text-sm"
              />
              <button 
                type="submit" 
                disabled={!inputQuestion.trim() || chatLoading}
                className={`w-11 h-11 p-0 flex items-center justify-center flex-shrink-0 rounded-xl transition-all duration-150 cursor-pointer ${
                  !inputQuestion.trim() || chatLoading 
                    ? 'bg-dark-900 text-dark-600 border border-dark-800 cursor-not-allowed shadow-none' 
                    : 'bg-brand-600 hover:bg-brand-500 active:scale-[0.98] text-white shadow-md shadow-brand-600/15'
                }`}
              >
                <FiSend size={15} />
              </button>
            </form>

          </div>
        )}
      </main>

    </div>
  );
}
