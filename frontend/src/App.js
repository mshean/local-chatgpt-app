import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { debounce } from 'lodash';
import { Virtuoso } from 'react-virtuoso';
import './App.css';

// Fixed MessageInput component with proper ref handling
const MessageInput = React.memo(React.forwardRef(({ onSendMessage, isLoading }, ref) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef(); // Ref for the actual textarea DOM element

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setInputValue(value);
    
    // Auto-resize the textarea
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 160) + 'px';
  }, []);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isLoading) {
        onSendMessage(inputValue.trim());
        setInputValue('');
        // Reset textarea height
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    }
  }, [inputValue, isLoading, onSendMessage]);

  const handleSendClick = useCallback(() => {
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [inputValue, isLoading, onSendMessage]);

  // Method to set input value from parent (for example prompts)
  React.useImperativeHandle(ref, () => ({
    setValue: (value) => setInputValue(value)
  }));

  return (
    <div className="input-container">
      <div className="input-form">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef} // Use textareaRef for DOM manipulation
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            placeholder="Message ChatGPT..."
            className="message-input"
            rows={1}
            disabled={isLoading}
            style={{ resize: 'none', overflow: 'hidden' }}
          />
          <button 
            onClick={handleSendClick}
            className={`send-button ${inputValue.trim() && !isLoading ? 'active' : ''}`}
            disabled={!inputValue.trim() || isLoading}
          >
            {isLoading ? '⏳' : '↑'}
          </button>
        </div>
      </div>
      <div className="input-footer">
        ChatGPT can make mistakes. Consider checking important information.
      </div>
    </div>
  );
}));

function App() {
  const [messages, setMessages] = useState([]);
  const [currentChatId, setCurrentChatId] = useState('');
  const [chats, setChats] = useState([]);
  const [editingTitle, setEditingTitle] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const virtuosoRef = useRef();
  const messageInputRef = useRef();

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
      } else {
        console.error('Error loading chat messages:', data.error);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  }, []);

  const handleSendMessage = useCallback(async (message) => {
    if (!message || isLoading) return;
    
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setIsLoading(true);
    
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${currentChatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
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
  }, [currentChatId, isLoading]);

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

  const handleExamplePrompt = useCallback((prompt) => {
    if (messageInputRef.current?.setValue) {
      messageInputRef.current.setValue(prompt);
    }
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

  const MessageList = React.memo(({ messages, onExamplePrompt, onCopy }) => {
    if (messages.length === 0) {
      return (
        <div className="welcome-screen">
          <div className="welcome-content">
            <h1>How can I help you today?</h1>
            <div className="example-prompts">
              <button 
                className="example-prompt"
                onClick={() => onExamplePrompt("Explain quantum computing in simple terms")}
              >
                Explain quantum computing
              </button>
              <button 
                className="example-prompt"
                onClick={() => onExamplePrompt("Write a Python function to reverse a string")}
              >
                Write a Python function
              </button>
              <button 
                className="example-prompt"
                onClick={() => onExamplePrompt("Plan a weekend trip to Paris")}
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
                                  onClick={() => onCopy(codeString)}
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
  });

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
          <MessageList 
            messages={messages} 
            onExamplePrompt={handleExamplePrompt}
            onCopy={handleCopy}
          />
          {isLoading && (
            <div style={{ padding: '0 24px' }}>
              <div style={{ maxWidth: 'none', margin: '0 auto' }}>
                <LoadingIndicator />
              </div>
            </div>
          )}
        </div>
        <MessageInput 
          ref={messageInputRef}
          onSendMessage={handleSendMessage} 
          isLoading={isLoading} 
        />
      </div>
    </div>
  );
}

export default App;