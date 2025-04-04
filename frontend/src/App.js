import React, { useState, useEffect } from 'react';
import './App.css'; // Ensure this is the correct path for your CSS file
import ReactMarkdown from 'react-markdown'; // To render markdown content
import SyntaxHighlighter from 'react-syntax-highlighter'; // For code block syntax highlighting
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';

function App() {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [currentChatId, setCurrentChatId] = useState('');

  const handleSendMessage = async () => {
    if (!message.trim()) return; // Don't send empty messages
    setMessages((prevMessages) => [
      ...prevMessages,
      { role: 'user', content: message },
    ]);

    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${currentChatId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

    setMessage(''); // Clear message input after sending
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  const handleChatSelection = (chatId) => {
    setCurrentChatId(chatId);
  };

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const response = await fetch('http://127.0.0.1:5000/api/chats');
        const data = await response.json();
        if (response.ok) {
          if (data.length > 0) {
            setCurrentChatId(data[0].chat_id);
            const chatResponse = await fetch(`http://127.0.0.1:5000/api/chat/${data[0].chat_id}`);
            const chatData = await chatResponse.json();
            setMessages(chatData.messages);
          }
        }
      } catch (error) {
        console.error('Error fetching chats:', error);
      }
    };

    fetchChats();
  }, []);

  return (
    <div className="App">
      <div className="sidebar">
        <button className="new-chat-btn" onClick={handleSendMessage}>New Chat</button>
        <div className="chat-list">
          {/* Render chat items */}
        </div>
      </div>

      <div className="chat-area">
        <div className="message-container">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              {msg.role === 'assistant' ? (
                <div className="assistant-response">
                  <ReactMarkdown
                    children={msg.content}
                    components={{
                      code({ inline, className, children, ...props }) {
                        const language = className?.replace('language-', '');
                        return !inline ? (
                          <SyntaxHighlighter style={docco} language={language} {...props}>
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                      p({ node, ...props }) {
                        // Ensure <p> tag does not contain <pre> tags
                        return <div {...props} />;
                      },
                    }}
                  />
                </div>
              ) : (
                <div className="user-message-content">{msg.content}</div>
              )}
            </div>
          ))}
        </div>

        <div className="message-input-container">
          <textarea
            value={message}
            onChange={handleInputChange}
            placeholder="Type your message..."
          ></textarea>
          <button className="send-btn" onClick={handleSendMessage}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
