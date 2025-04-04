import React from 'react';

const ChatList = ({ chats, selectChat }) => {
  return (
    <div>
      <h2>Chats</h2>
      <ul>
        {chats.map(chat => (
          <li key={chat.chat_id} onClick={() => selectChat(chat.chat_id)}>
            {chat.title}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChatList;

