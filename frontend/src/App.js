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

  // Handle new message input
  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!message.trim()) return; // Prevent sending empty messages

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

  // Handle creating a new chat
  const handleNewChat = async () => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/chat', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentChatId(data.chat_id);
        setMessages([]); // Reset messages for the new chat
        setChats((prevChats) => [...prevChats, data]); // Add new chat to the list
      } else {
        console.error('Error creating chat:', data.error);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  };

  // Handle deleting a chat
  const handleDeleteChat = async (chatId) => {
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/chat/${chatId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setChats((prevChats) => prevChats.filter(chat => chat.chat_id !== chatId)); // Remove deleted chat from the list
        if (chatId === currentChatId) {
          setCurrentChatId('');
          setMessages([]); // Clear current chat's messages
        }
      } else {
        console.error('Error deleting chat:', data.error);
      }
    } catch (error) {
      console.error('Error with fetch:', error);
    }
  };

  // Render list of chats
  const renderChats = () => {
    return chats.map((chat) => (
      <div
        key={chat.chat_id}
        onClick={() => setCurrentChatId(chat.chat_id)}
        className={`chat-item ${chat.chat_id === currentChatId ? 'active' : ''}`}
      >
        {chat.title}
        <button className="delete-chat-btn" onClick={() => handleDeleteChat(chat.chat_id)}>Delete</button>
      </div>
    ));
  };

  return (
    <div className="App">
      <div className="sidebar">
        <button className="new-chat-btn" onClick={handleNewChat}>New Chat</button>
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
                      p({ node, children, ...props }) {
                        // Prevent <p> tags from wrapping <pre> tags to avoid hydration errors
                        return <div {...props}>{children}</div>;
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
          />
          <button onClick={handleSendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default App;
