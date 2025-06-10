import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { debounce } from 'lodash';
import { Virtuoso } from 'react-virtuoso';

function App() {
  const [messages, setMessages] = useState([]);
  const [currentChatId, setCurrentChatId] = useState('');
  const [chats, setChats] = useState([]);
  const [editingTitle, setEditingTitle] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pastedCode, setPastedCode] = useState('');
  const inputRef = useRef();
  const messageInputRef = useRef('');
  const virtuosoRef = useRef(); // Reference to the Virtuoso component

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && virtuosoRef.current) {
      // Small delay to ensure the message is rendered before scrolling
      setTimeout(() => {
        virtuosoRef.current.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [messages]);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const response = await fetch('http://127.0.0.1:5000/api/chats');
        const data = await response.json();
        if (response.ok) {
          setChats(data);
          if (data.length > 0) {
            setCurrentChatId(data[0].chat_id);
            loadChatMessages(data[0].chat_id);
          }
        }
      } catch (error) {
        console.error('Error fetching chats:', error);
      }
    };
    fetchChats();
  }, []);

  const loadChatMessages = useCallback(async (chatId) => {
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${chatId}`);
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages);
        // Scroll to bottom after loading messages
        setTimeout(() => {
          if (virtuosoRef.current && data.messages.length > 0) {
            virtuosoRef.current.scrollToIndex({
              index: data.messages.length - 1,
              align: 'end',
              behavior: 'auto'
            });
          }
        }, 100);
      } else {
        console.error('Error loading chat messages:', data.error);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  }, []);

  const handleSendMessage = useCallback(async (e) => {
    e?.preventDefault();
    const message = messageInputRef.current.trim();
    if (!message || isLoading) return;
    
    // Clear the input immediately
    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.value = '';
      inputElement.style.height = 'auto'; // Reset height for auto-resize
    }
    
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    messageInputRef.current = '';
    setIsLoading(true);
    
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${currentChatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, code: pastedCode }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
        if (data.reply) {
          const updatedChats = await fetch('http://127.0.0.1:5000/api/chats').then(r => r.json());
          if (Array.isArray(updatedChats)) {
            setChats(updatedChats);
          }
        }
      } else {
        setMessages((prev) => [...prev, { 
          role: 'assistant', 
          content: 'Sorry, I encountered an error. Please try again.' 
        }]);
      }
    } catch (error) {
      setMessages((prev) => [...prev, { 
        role: 'assistant', 
        content: 'Network error. Please check your connection and try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [currentChatId, isLoading, pastedCode]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleNewChat = useCallback(async () => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/chat', {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok) {
        setCurrentChatId(data.chat_id);
        setMessages([]);
        setChats((prev) => [data, ...prev]);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  }, []);

  const handleReopenChat = useCallback((chatId) => {
    setCurrentChatId(chatId);
    loadChatMessages(chatId);
  }, [loadChatMessages]);

  const handleDeleteChat = useCallback(async (chatId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this conversation?')) return;
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${chatId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setChats((prev) => prev.filter(chat => chat.chat_id !== chatId));
        if (chatId === currentChatId) {
          setCurrentChatId('');
          setMessages([]);
        }
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  }, [currentChatId]);

  const handleRenameChat = useCallback((chatId, e) => {
    e.stopPropagation();
    setEditingTitle(chatId);
    const chat = chats.find(c => c.chat_id === chatId);
    setNewTitle(chat.title);
  }, [chats]);

  const handleSaveTitle = useCallback(async (chatId) => {
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${chatId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (response.ok) {
        setChats((prev) =>
          prev.map((chat) =>
            chat.chat_id === chatId ? { ...chat, title: newTitle } : chat
          )
        );
        setEditingTitle(null);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  }, [newTitle]);

  const handleCopy = useCallback(async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  }, []);

  const isCodeLine = (line) => {
    const codeKeywords = ['function', 'var', 'let', 'const', 'if', 'else', 'return', 'class'];
    const codeSymbols = ['{', '}', '(', ')', ';', '=', '=>'];
    if (/^\s{2,}/.test(line)) return true;
    if (codeKeywords.some(keyword => line.includes(keyword))) return true;
    if (codeSymbols.some(symbol => line.includes(symbol))) return true;
    return false;
  };

  const handlePaste = (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData('Text');
    const lines = pastedData.split('\n');
    const codeLines = lines.filter(isCodeLine);
    if (codeLines.length > 0) {
      e.preventDefault();
      const code = codeLines.join('\n');
      setPastedCode((prev) => prev + '\n' + code);
      messageInputRef.current += '\n' + code;
    }
  };

  // Auto-resize textarea
  const handleInputChange = useCallback((e) => {
    messageInputRef.current = e.target.value;
    
    // Auto-resize the textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  }, []);

  const LoadingIndicator = () => (
    <div className="loading-message">
      <div className="loading-dots">
        <div></div>
        <div></div>
        <div></div>
      </div>
    </div>
  );

  const MessageList = React.memo(({ messages }) => {
    if (messages.length === 0) {
      return (
        <div className="welcome-screen">
          <div className="welcome-content">
            <h1>How can I help you today?</h1>
            <div className="example-prompts">
              <button 
                className="example-prompt"
                onClick={() => {
                  messageInputRef.current = "Explain quantum computing in simple terms";
                  if (inputRef.current) {
                    inputRef.current.value = messageInputRef.current;
                  }
                }}
              >
                Explain quantum computing
              </button>
              <button 
                className="example-prompt"
                onClick={() => {
                  messageInputRef.current = "Write a Python function to reverse a string";
                  if (inputRef.current) {
                    inputRef.current.value = messageInputRef.current;
                  }
                }}
              >
                Write a Python function
              </button>
              <button 
                className="example-prompt"
                onClick={() => {
                  messageInputRef.current = "Plan a weekend trip to Paris";
                  if (inputRef.current) {
                    inputRef.current.value = messageInputRef.current;
                  }
                }}
              >
                Plan a weekend trip
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ height: '100%', width: '100%', padding: '24px 32px 0 32px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', height: '100%' }}>
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: '100%', width: '100%' }}
            totalCount={messages.length}
            itemContent={(index) => {
              const msg = messages[index];
              return (
                <div key={index} className={`message-block ${msg.role}`} style={{ marginBottom: '16px' }}>
                  <div className="msg-avatar">
                    {msg.role === 'user' ? '🧑' : '🤖'}
                  </div>
                  <div className="msg-bubble">
                    <ReactMarkdown
                      components={{
                        code: ({ node, inline, className, children, ...props }) => {
                          const match = /language-(\w+)/.exec(className || '');
                          const codeString = String(children).replace(/\n$/, '');
                          return !inline && match ? (
                            <div className="code-block-container">
                              <div className="code-block-header">
                                <span className="code-language">{match[1]}</span>
                                <button
                                  onClick={() => handleCopy(codeString)}
                                  className="copy-button"
                                >
                                  📋 Copy
                                </button>
                              </div>
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {codeString}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code className="inline-code" {...props}>{children}</code>
                          );
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              );
            }}
            followOutput="smooth"
          />
        </div>
      </div>
    );
  }, (prevProps, nextProps) => prevProps.messages === nextProps.messages);

  return (
    <div className="app">
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <button onClick={handleNewChat} className="new-chat-btn">
            ➕ New chat
          </button>
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="collapse-btn"
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>
        {!sidebarCollapsed && (
          <div className="chat-list">
            {chats.map((chat) => (
              <div 
                key={chat.chat_id} 
                className={`chat-item ${chat.chat_id === currentChatId ? 'active' : ''}`}
                onClick={() => handleReopenChat(chat.chat_id)}
              >
                {editingTitle === chat.chat_id ? (
                  <div className="chat-edit-container">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="chat-title-input"
                      onBlur={() => handleSaveTitle(chat.chat_id)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSaveTitle(chat.chat_id)}
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <div className="chat-title" title={chat.title}>
                      {chat.title}
                    </div>
                    <div className="chat-actions">
                      <button
                        onClick={(e) => handleRenameChat(chat.chat_id, e)}
                        className="chat-action-btn"
                        title="Rename"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => handleDeleteChat(chat.chat_id, e)}
                        className="chat-action-btn delete"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="main-content">
        <MessageList messages={messages} />
        {isLoading && (
          <div style={{ padding: '0 32px' }}>
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <LoadingIndicator />
            </div>
          </div>
        )}
        <div className="input-container">
          <div className="input-form">
            <div className="input-wrapper">
              <textarea
                ref={inputRef}
                defaultValue={messageInputRef.current}
                onChange={handleInputChange}
                onKeyDown={handleKeyPress}
                onPaste={handlePaste}
                placeholder="Message ChatGPT..."
                className="message-input"
                rows={1}
                disabled={isLoading}
              />
              <button 
                onClick={handleSendMessage}
                className={`send-button ${messageInputRef.current.trim() && !isLoading ? 'active' : ''}`}
                disabled={!messageInputRef.current.trim() || isLoading}
              >
                {isLoading ? '⏳' : '↑'}
              </button>
            </div>
          </div>
          <div className="input-footer">
            ChatGPT can make mistakes. Consider checking important information.
          </div>
        </div>
      </div>
      <style>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background-color: #212121;
          color: #ececec;
        }
        .app {
          display: flex;
          height: 100vh;
          background-color: #212121;
          overflow: hidden;
        }
        .sidebar {
          width: 260px;
          background-color: #171717;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #2f2f2f;
          overflow-y: auto;
          transition: width 0.2s ease;
        }
        .sidebar.collapsed { width: 50px; }
        .sidebar-header {
          padding: 16px;
          display: flex;
          gap: 8px;
          border-bottom: 1px solid #2f2f2f;
        }
        .new-chat-btn {
          flex: 1;
          background: #2f2f2f;
          color: #ececec;
          border: 1px solid #4a4a4a;
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }
        .new-chat-btn:hover { background: #3a3a3a; }
        .collapse-btn {
          background: transparent;
          border: 1px solid #4a4a4a;
          color: #ececec;
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          width: 44px;
        }
        .chat-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }
        .chat-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          margin-bottom: 4px;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .chat-item:hover, .chat-item.active { background-color: #2f2f2f; }
        .chat-title {
          flex: 1;
          font-size: 14px;
          color: #ececec;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-right: 8px;
        }
        .chat-actions {
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .chat-item:hover .chat-actions { opacity: 1; }
        .chat-action-btn {
          background: transparent;
          border: none;
          color: #8e8ea0;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          font-size: 12px;
        }
        .chat-action-btn:hover { background: #3a3a3a; color: #ececec; }
        .chat-action-btn.delete:hover { color: #ff6b6b; }
        .chat-edit-container { flex: 1; }
        .chat-title-input {
          width: 100%;
          background: #2f2f2f;
          border: 1px solid #4a4a4a;
          color: #ececec;
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 14px;
        }
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #212121;
          overflow: hidden;
          min-width: 0;
        }
        .message-block {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          width: 100%;
        }
        .message-block.user .msg-avatar {
          background: #0a84ff;
          color: #fff;
        }
        .message-block.assistant .msg-avatar {
          background: #4b5563;
          color: #fff;
        }
        .msg-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 4px;
          flex-shrink: 0;
        }
        .msg-bubble {
          background: #282828;
          color: #ececec;
          border-radius: 10px;
          padding: 16px 18px;
          font-size: 16px;
          line-height: 1.7;
          word-break: break-word;
          max-width: 100%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.07);
        }
        .message-block.user .msg-bubble {
          background: #0a192f;
        }
        .message-block.assistant .msg-bubble {
          background: #232336;
        }
        .inline-code {
          background: #232336;
          color: #ffb86b;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 15px;
        }
        .code-block-container {
          margin: 12px 0;
          border-radius: 8px;
          overflow: hidden;
          background: #181825;
          border: 1px solid #232336;
        }
        .code-block-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #232336;
          padding: 6px 12px;
        }
        .code-language {
          color: #8e8ea0;
          font-size: 13px;
        }
        .copy-button {
          background: #232336;
          border: 1px solid #393950;
          color: #ececec;
          border-radius: 6px;
          padding: 2px 8px;
          font-size: 13px;
          cursor: pointer;
        }
        .copy-button:hover { background: #393950; }
        .input-container {
          padding: 0 32px 24px 32px;
          background: linear-gradient(0deg, #212121 80%, rgba(33,33,33,0.7) 100%);
          width: 100%;
          max-width: 700px;
          margin: 0 auto;
        }
        .input-form {
          display: flex;
          align-items: flex-end;
        }
        .input-wrapper {
          flex: 1;
          display: flex;
          align-items: flex-end;
          background: #232336;
          border-radius: 12px;
          padding: 12px 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .message-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #ececec;
          font-size: 16px;
          resize: none;
          outline: none;
          padding: 0;
          min-height: 32px;
          max-height: 160px;
          overflow-y: auto;
        }
        .send-button {
          background: #232336;
          border: none;
          color: #8e8ea0;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 18px;
          cursor: pointer;
          margin-left: 8px;
          transition: background 0.2s, color 0.2s;
          flex-shrink: 0;
        }
        .send-button.active { color: #ececec; background: #393950; }
        .send-button:disabled { opacity: 0.5; cursor: not-allowed; }
        .input-footer {
          margin-top: 8px;
          font-size: 13px;
          color: #8e8ea0;
          text-align: center;
        }
        .loading-message {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          padding: 16px;
          gap: 14px;
        }
        .loading-dots {
          display: flex;
          gap: 4px;
          margin-left: 50px;
        }
        .loading-dots div {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #8e8ea0;
          animation: loading-bounce 1s infinite alternate;
        }
        .loading-dots div:nth-child(2) { animation-delay: 0.2s; }
        .loading-dots div:nth-child(3) { animation-delay: 0.4s; }
        @keyframes loading-bounce {
          to { transform: translateY(-8px); opacity: 0.6; }
        }
        .welcome-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #ececec;
        }
        .welcome-content h1 { font-size: 2rem; margin-bottom: 24px; }
        .example-prompts { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
        .example-prompt {
          background: #2f2f2f;
          color: #ececec;
          border: 1px solid #4a4a4a;
          border-radius: 8px;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        }
        .example-prompt:hover { background: #3a3a3a; }
        @media (max-width: 800px) {
          .input-container {
            max-width: 100%;
            padding: 0 16px 24px 16px;
          }
          .main-content {
            padding: 0;
          }
          .example-prompts {
            flex-direction: column;
            align-items: center;
          }
        }
      `}</style>
    </div>
  );
}

export default App;