import type { AgentConversation, Contact, Message } from "yunidesk";

export function contact(id: string, patch: Partial<Contact> = {}): Contact {
  return {
    id,
    externalId: null,
    name: id,
    email: null,
    emailVerified: false,
    avatarUrl: null,
    attributes: {},
    isIdentified: false,
    lastChannel: "web",
    createdAt: 0,
    lastSeenAt: null,
    online: false,
    ...patch,
  };
}

export function conversation(id: string, lastMessageAt: number, patch: Partial<AgentConversation> = {}): AgentConversation {
  return {
    id,
    status: "open",
    channel: "web",
    contact: contact(`ctc_${id}`),
    assignee: null,
    createdAt: 0,
    updatedAt: lastMessageAt,
    lastMessageAt,
    lastMessage: null,
    unread: false,
    contactLastReadAt: null,
    agentLastReadAt: null,
    snoozedUntil: null,
    rating: null,
    tags: [],
    priority: "normal",
    customFields: {},
    team: null,
    ...patch,
  };
}

export function message(id: string, createdAt: number, patch: Partial<Message> = {}): Message {
  return {
    id,
    conversationId: "c1",
    authorType: "contact",
    agent: null,
    kind: "text",
    body: id,
    event: null,
    attachments: [],
    clientId: null,
    createdAt,
    ...patch,
  };
}
