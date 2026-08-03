function resumeDigestKey(digest) {
  return Buffer.isBuffer(digest) ? digest.toString("hex") : "";
}

export function createQuickMatchQueue({ sameResumeToken }) {
  if (typeof sameResumeToken !== "function") {
    throw new TypeError("quick-match queue requires a resume-token comparator");
  }

  let head = null;
  let tail = null;
  let length = 0;
  const bySocket = new Map();
  const byResumeDigest = new Map();

  function unlink(node) {
    if (!node) return false;
    if (node.previous) node.previous.next = node.next;
    else head = node.next;
    if (node.next) node.next.previous = node.previous;
    else tail = node.previous;

    bySocket.delete(node.entry.socket);
    const digestKey = resumeDigestKey(node.entry.resumeClaim?.digest);
    if (digestKey && byResumeDigest.get(digestKey) === node) {
      byResumeDigest.delete(digestKey);
    }
    node.previous = null;
    node.next = null;
    length -= 1;
    return true;
  }

  function push(entry) {
    const node = { entry, previous: tail, next: null };
    if (tail) tail.next = node;
    else head = node;
    tail = node;
    bySocket.set(entry.socket, node);
    const digestKey = resumeDigestKey(entry.resumeClaim?.digest);
    if (digestKey) byResumeDigest.set(digestKey, node);
    length += 1;
    return node;
  }

  function removeBySocket(socket) {
    return unlink(bySocket.get(socket));
  }

  function shift() {
    if (!head) return null;
    const entry = head.entry;
    unlink(head);
    return entry;
  }

  function positionOf(node) {
    let position = 1;
    for (let current = head; current; current = current.next, position += 1) {
      if (current === node) return position;
    }
    return 0;
  }

  function replaceByResume(digest, entry, cryptoRuntime) {
    const digestKey = resumeDigestKey(digest);
    const node = byResumeDigest.get(digestKey);
    if (!node || !sameResumeToken(node.entry.resumeClaim?.digest, digest, cryptoRuntime)) {
      return null;
    }

    const previousEntry = node.entry;
    bySocket.delete(previousEntry.socket);
    const previousDigestKey = resumeDigestKey(previousEntry.resumeClaim?.digest);
    if (previousDigestKey && byResumeDigest.get(previousDigestKey) === node) {
      byResumeDigest.delete(previousDigestKey);
    }
    node.entry = entry;
    bySocket.set(entry.socket, node);
    const nextDigestKey = resumeDigestKey(entry.resumeClaim?.digest);
    if (nextDigestKey) byResumeDigest.set(nextDigestKey, node);
    return { entry: previousEntry, position: positionOf(node) };
  }

  return Object.freeze({
    push,
    shift,
    removeBySocket,
    replaceByResume,
    positionOf,
    size: () => length
  });
}
