import { createContext, useContext, useState } from 'react';

const ActiveChatContext = createContext(null);

export function ActiveChatProvider({ children }) {
  const [activeChatId, setActiveChatId] = useState(null);
  return (
    <ActiveChatContext.Provider value={{ activeChatId, setActiveChatId }}>
      {children}
    </ActiveChatContext.Provider>
  );
}

export function useActiveChat() {
  return useContext(ActiveChatContext);
}
