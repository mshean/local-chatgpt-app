import React, { useState, useEffect } from 'react';
import './App.css'; // Ensure the CSS is properly linked
import ReactMarkdown from 'react-markdown'; // For rendering markdown
import SyntaxHighlighter from 'react-syntax-highlighter'; // For code block formatting
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';

function App() {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [currentChatId, setCurrentChatId] = useState('');
  const [chats, setChats] = useState([]);
  const [editingTitle, setEditingTitle] = useState(null);
  const [newTitle, setNewTitle] = useState('');

  // Fetch chats when component mounts
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

  const loadChatMessages = async (chatId) => {
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
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    setMessages((prevMessages) => [
      ...prevMessages,
      { role: 'user', content: message },
    ]);

    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${currentChatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prevMessages) => [
          ...prevMessages,
          { role: 'assistant', content: data.reply },
        ]);
      } else {
        console.error('Error:', data.error);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }

    setMessage('');
  };

  const handleNewChat = async () => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/chat', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentChatId(data.chat_id);
        setMessages([]);
        setChats((prevChats) => [...prevChats, data]);
      } else {
        console.error('Error creating chat:', data.error);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  };

  const handleReopenChat = async (chatId) => {
    setCurrentChatId(chatId);
    loadChatMessages(chatId);
  };

  const handleDeleteChat = async (chatId) => {
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${chatId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setChats((prevChats) => prevChats.filter(chat => chat.chat_id !== chatId));
        if (chatId === currentChatId) {
          setCurrentChatId('');
          setMessages([]);
        }
      } else {
        console.error('Error deleting chat:', data.error);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  };

  const handleRenameChat = (chatId) => {
    setEditingTitle(chatId);
    const chat = chats.find(c => c.chat_id === chatId);
    setNewTitle(chat.title);
  };

  const handleSaveTitle = async (chatId) => {
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${chatId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });

      const data = await response.json();

      if (response.ok) {
        setChats((prevChats) =>
          prevChats.map((chat) =>
            chat.chat_id === chatId ? { ...chat, title: newTitle } : chat
          )
        );
        setEditingTitle(null);
      } else {
        console.error('Error updating title:', data.error);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  };

  const renderChats = () => {
    return chats.map((chat) => (
      <div key={chat.chat_id} className="chat-item">
        <div className="chat-title-container">
          {editingTitle === chat.chat_id ? (
            <>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="chat-title-input"
              />
              <button onClick={() => handleSaveTitle(chat.chat_id)} className="save-title-button">
                Save
              </button>
            </>
          ) : (
            <>
              <span
                className="chat-title"
                onClick={() => handleReopenChat(chat.chat_id)}
              >
                {chat.title}
              </span>
              <button
                onClick={() => handleRenameChat(chat.chat_id)}
                className="rename-chat-button"
              >
                ✎
              </button>
            </>
          )}
        </div>
        <button
          onClick={() => handleDeleteChat(chat.chat_id)}
          className="delete-chat-button"
        >
          ❌
        </button>
      </div>
    ));
  };

  return (
    <div className="App">
      <div className="sidebar">
        <button onClick={handleNewChat} className="new-chat-btn">
          New Chat
        </button>
        <div className="chat-list">
          {renderChats()}
        </div>
      </div>
      <div className="chat-area">
        <div className="message-container">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <ReactMarkdown
                children={msg.content}
                components={{
                  code: ({ node, inline, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={docco}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code {...props}>{children}</code>
                    );
                  },
                }}
              />
            </div>
          ))}
        </div>
        <div className="message-input-container">
          <textarea
            value={message}
            onChange={handleInputChange}
            placeholder="Type your message..."
          />
          <button onClick={handleSendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default App;
