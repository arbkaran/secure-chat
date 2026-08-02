import { useEffect, useRef } from 'react';
import { getSocket } from '../api/socket';

export default function useSocketListener({
  onMessage,
  onTyping,
  onStatusUpdate,
  onReadReceipt,
  onConnectionRequest,
  onConnectionAccepted,
  onConnectionRejected,
} = {}) {
  const handlersRef = useRef({
    onMessage,
    onTyping,
    onStatusUpdate,
    onReadReceipt,
    onConnectionRequest,
    onConnectionAccepted,
    onConnectionRejected,
  });

  useEffect(() => {
    handlersRef.current = {
      onMessage,
      onTyping,
      onStatusUpdate,
      onReadReceipt,
      onConnectionRequest,
      onConnectionAccepted,
      onConnectionRejected,
    };
  });

  useEffect(() => {
    const handleMessage = (p) => handlersRef.current.onMessage?.(p);
    const handleTyping = (p) => handlersRef.current.onTyping?.(p);
    const handleStatusUpdate = (p) => handlersRef.current.onStatusUpdate?.(p);
    const handleReadReceipt = (p) => handlersRef.current.onReadReceipt?.(p);
    const handleConnectionRequest = (p) => handlersRef.current.onConnectionRequest?.(p);
    const handleConnectionAccepted = (p) => handlersRef.current.onConnectionAccepted?.(p);
    const handleConnectionRejected = (p) => handlersRef.current.onConnectionRejected?.(p);

    let cancelled = false;
    let attachedSocket = null;
    let retryTimer = null;

    function trySubscribe() {
      const socket = getSocket();
      if (socket) {
        attachedSocket = socket;
        socket.on('message', handleMessage);
        socket.on('typing', handleTyping);
        socket.on('status_update', handleStatusUpdate);
        socket.on('read_receipt', handleReadReceipt);
        socket.on('connection_request', handleConnectionRequest);
        socket.on('connection_accepted', handleConnectionAccepted);
        socket.on('connection_rejected', handleConnectionRejected);
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
        attachedSocket.off('connection_request', handleConnectionRequest);
        attachedSocket.off('connection_accepted', handleConnectionAccepted);
        attachedSocket.off('connection_rejected', handleConnectionRejected);
      }
    };
  }, []);
}
