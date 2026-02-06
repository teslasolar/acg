/**
 * ACG Chat - Threaded Replies
 * Supports threaded conversations within channels.
 */

export function getThreadReplies(messages, parentId) {
  return messages.filter(m => m.replyTo === parentId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function buildThreadTree(messages) {
  const roots = [];
  const childMap = new Map();

  for (const msg of messages) {
    if (!msg.replyTo) {
      roots.push(msg);
    } else {
      if (!childMap.has(msg.replyTo)) childMap.set(msg.replyTo, []);
      childMap.get(msg.replyTo).push(msg);
    }
  }

  function attachChildren(node) {
    const children = childMap.get(node.id) || [];
    return {
      ...node,
      replies: children.map(attachChildren),
      replyCount: children.length,
    };
  }

  return roots.map(attachChildren);
}

export function getThreadDepth(messages, messageId) {
  let depth = 0;
  let current = messages.find(m => m.id === messageId);
  while (current && current.replyTo) {
    depth++;
    current = messages.find(m => m.id === current.replyTo);
    if (depth > 50) break; // safety limit
  }
  return depth;
}

export function flattenThread(threadNode, depth = 0) {
  const result = [{ ...threadNode, depth }];
  if (threadNode.replies) {
    for (const reply of threadNode.replies) {
      result.push(...flattenThread(reply, depth + 1));
    }
  }
  return result;
}
