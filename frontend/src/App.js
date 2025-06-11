import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { debounce } from 'lodash';
import { Virtuoso } from 'react-virtuoso';
import './App.css';

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
  const virtuosoRef = useRef();

  // Remove manual scrolling - let Virtuoso handle it automatically

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
        // Remove the setTimeout scrolling from here - let the useEffect handle it
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
      <div style={{ height: '100%', width: '100%', padding: '24px 24px 24px 24px' }}>
        <div style={{ maxWidth: 'none', margin: '0 auto', height: '100%' }}>
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
            initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
          />
        </div>
      </div>
    );
  }, (prevProps, nextProps) => prevProps.messages === nextProps.messages);

  return (
    <div className="app">
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!sidebarCollapsed ? (
            <>
              <button onClick={handleNewChat} className="new-chat-btn">
                ➕ New chat
              </button>
              <button 
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="collapse-btn"
                title="Collapse sidebar"
              >
                ←
              </button>
            </>
          ) : (
            <div className="collapsed-header">
              <button onClick={handleNewChat} className="new-chat-btn-collapsed" title="New chat">
                ➕
              </button>
              <button 
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="expand-btn"
                title="Expand sidebar"
              >
                →
              </button>
            </div>
          )}
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
        <div className="messages-area">
          <MessageList messages={messages} />
          {isLoading && (
            <div style={{ padding: '0 24px' }}>
              <div style={{ maxWidth: 'none', margin: '0 auto' }}>
                <LoadingIndicator />
              </div>
            </div>
          )}
        </div>
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
    </div>
  );
}

export default App;