import React from 'react';

const ChatWindow = ({ chat }) => {
  return (
    <div>
      <h3>{chat.title}</h3>
      <div>
        {chat.messages.map((msg, index) => (
          <div key={index}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatWindow;

