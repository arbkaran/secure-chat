import { useEffect, useRef } from 'react';
import { getSocket } from '../api/socket';

// Subscribes the currently-connected socket to the app's real-time events.
// Handlers are read from a ref so callers can pass inline functions without
// re-subscribing on every render.
export default function useSocketListener({ onMessage, onTyping, onStatusUpdate, onReadReceipt } = {}) {
  const handlersRef = useRef({ onMessage, onTyping, onStatusUpdate, onReadReceipt });

  useEffect(() => {
    handlersRef.current = { onMessage, onTyping, onStatusUpdate, onReadReceipt };
  });

  useEffect(() => {
    const handleMessage = (payload) => handlersRef.current.onMessage?.(payload);
    const handleTyping = (payload) => handlersRef.current.onTyping?.(payload);
    const handleStatusUpdate = (payload) => handlersRef.current.onStatusUpdate?.(payload);
    const handleReadReceipt = (payload) => handlersRef.current.onReadReceipt?.(payload);

    let cancelled = false;
    let attachedSocket = null;
    let retryTimer = null;

    // connectSocket() resolves async, so the socket instance may not exist
    // yet on mount — poll briefly until it does rather than missing events.
    function trySubscribe() {
      const socket = getSocket();
      if (socket) {
        attachedSocket = socket;
        socket.on('message', handleMessage);
        socket.on('typing', handleTyping);
        socket.on('status_update', handleStatusUpdate);
        socket.on('read_receipt', handleReadReceipt);
      } else if (!cancelled) {
        retryTimer = setTimeout(trySubscribe, 300);
      }
    }
    trySubscribe();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (attachedSocket) {
        attachedSocket.off('message', handleMessage);
        attachedSocket.off('typing', handleTyping);
        attachedSocket.off('status_update', handleStatusUpdate);
        attachedSocket.off('read_receipt', handleReadReceipt);
      }
    };
  }, []);
}
