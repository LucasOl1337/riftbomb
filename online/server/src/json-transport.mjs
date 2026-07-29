const DEFAULT_OPEN_STATE = 1;
const DEFAULT_MAX_BUFFERED_AMOUNT = 256_000;

export function createJsonTransport({
  serialize = JSON.stringify,
  openState = DEFAULT_OPEN_STATE,
  maxBufferedAmount = DEFAULT_MAX_BUFFERED_AMOUNT
} = {}) {
  function canSend(socket) {
    return socket?.readyState === openState &&
      socket.bufferedAmount < maxBufferedAmount;
  }

  function send(socket, message) {
    if (!canSend(socket)) return false;
    socket.send(serialize(message));
    return true;
  }

  function broadcast(sockets, message) {
    let payload;
    let sent = 0;
    for (const socket of sockets) {
      if (!canSend(socket)) continue;
      payload ??= serialize(message);
      socket.send(payload);
      sent += 1;
    }
    return sent;
  }

  return { send, broadcast };
}
