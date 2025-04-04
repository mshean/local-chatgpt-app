import React, { useState } from 'react';

const MessageInput = ({ sendMessage }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      sendMessage(message); // Send the message to the parent
      setMessage(''); // Clear the input after sending
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="text" 
        value={message} 
        onChange={(e) => setMessage(e.target.value)} 
        placeholder="Type your message"
        style={{ padding: '10px', fontSize: '16px', width: '100%' }}
      />
      <button type="submit" style={{ padding: '10px', marginTop: '5px' }}>
        Send
      </button>
    </form>
  );
};

export default MessageInput;
