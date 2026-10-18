import { API_SCOPES, AUDIT_ACTIONS } from "yunidesk";
import { WEBHOOK_EVENT_NAMES } from "yunidesk/webhooks";

/** OpenAPI 3.1 description of what an API key can call, plus the webhook payloads. Served at /api/openapi.json. */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema: object) => ({ oneOf: [schema, { type: "null" }] });
const id = (prefix: string) => ({ type: "string", pattern: `^${prefix}_[0-9a-z]{26}$` });
const ms = { type: "integer", description: "Unix epoch milliseconds" };
const json = (schema: object) => ({ "application/json": { schema } });
const ok = (schema: object, description = "OK") => ({ description, content: json(schema) });
const page = (item: string) => ({
  type: "object",
  required: ["items", "nextCursor"],
  properties: { items: { type: "array", items: ref(item) }, nextCursor: nullable({ type: "string" }) },
});
const pathId = (name: string, prefix: string) => ({ name, in: "path", required: true, schema: id(prefix) });
const errors = {
  "400": { $ref: "#/components/responses/Error" },
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
  "404": { $ref: "#/components/responses/Error" },
  "429": { $ref: "#/components/responses/Error" },
};
const op = (operationId: string, scope: string | null, summary: string, rest: object) => ({
  operationId,
  summary,
  security: [{ apiKey: scope ? [scope] : [] }],
  ...(scope ? { "x-required-scope": scope } : {}),
  ...rest,
});

/** Dashboard routes: cookie session only, API keys are refused. */
const sessionOp = (operationId: string, summary: string, rest: object) => ({ operationId, summary, security: [{ session: [] }], ...rest });
const auditFilters = (extra: object[]) => [
  ...extra,
  { name: "action", in: "query", schema: { type: "string" }, description: "One action (team.role_changed) or a group (team)" },
  { name: "actor", in: "query", schema: { type: "string" }, description: "An agent or API key id" },
];

const conversationPatch = {
  type: "object",
  properties: {
    status: { enum: ["open", "snoozed", "resolved"] },
    snoozedUntil: nullable(ms),
    assigneeId: nullable({ ...id("agt"), description: "A teammate id from GET /teammates" }),
  },
};

const endpointInput = {
  type: "object",
  required: ["url", "events"],
  properties: {
    url: { type: "string", format: "uri", description: "Public https URL" },
    description: nullable({ type: "string", maxLength: 200 }),
    events: { type: "array", minItems: 1, items: { enum: ["*", ...WEBHOOK_EVENT_NAMES] } },
  },
};

const webhookEvent = (event: string, data: object) => ({
  post: {
    operationId: `webhook.${event}`,
    summary: event,
    // Not called with a key: we call you, signed with the endpoint's secret.
    security: [],
    description: "Signed with X-Yunidesk-Signature: t=<ms>,v1=<hex HMAC-SHA256 of \"<t>.<raw body>\">. Use `id` to drop duplicates.",
    requestBody: {
      content: json({
        type: "object",
        required: ["id", "event", "createdAt", "data"],
        properties: { id: id("evt"), event: { const: event }, createdAt: ms, data },
      }),
    },
    responses: { "2XX": { description: "Received. Anything else is retried for about 3 days." } },
  },
});

const contactSummary = {
  type: "object",
  properties: {
    id: id("ctc"),
    externalId: nullable({ type: "string", description: "Your user id when the contact was identified" }),
    email: nullable({ type: "string" }),
    name: nullable({ type: "string" }),
  },
};
const actor = {
  type: "object",
  properties: { type: { enum: ["contact", "agent", "bot", "system"] }, id: nullable({ type: "string" }) },
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Yunidesk team API",
    version: "1",
    description:
      "Server-to-server API for integrations. Authenticate with `Authorization: Bearer ydk_…` (Settings → API keys). " +
      "Each key acts as a bot teammate and may only call the routes its scopes allow. Never use a key in a browser or an app.",
    license: { name: "MIT", identifier: "MIT" },
  },
  servers: [{ url: "{baseUrl}/api/agent", variables: { baseUrl: { default: "https://support.example.com" } } }],
  components: {
    securitySchemes: {
      apiKey: { type: "http", scheme: "bearer", bearerFormat: "ydk_<39 chars>", description: `Scopes: ${API_SCOPES.join(", ")}` },
      session: { type: "apiKey", in: "cookie", name: "__Host-ys_session", description: "Dashboard session; these routes refuse API keys" },
    },
    responses: {
      Error: {
        description: "Error",
        content: json({
          type: "object",
          properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } },
        }),
      },
    },
    schemas: {
      PublicAgent: {
        type: "object",
        properties: { id: id("agt"), name: { type: "string" }, avatarUrl: nullable({ type: "string" }), isBot: { type: "boolean" } },
      },
      Contact: {
        type: "object",
        properties: {
          id: id("ctc"),
          externalId: nullable({ type: "string" }),
          name: nullable({ type: "string" }),
          email: nullable({ type: "string" }),
          emailVerified: { type: "boolean" },
          avatarUrl: nullable({ type: "string" }),
          attributes: { type: "object", additionalProperties: true },
          isIdentified: { type: "boolean" },
          lastChannel: nullable({ type: "string" }),
          createdAt: ms,
          lastSeenAt: nullable(ms),
          online: { type: "boolean" },
        },
      },
      Attachment: {
        type: "object",
        properties: {
          id: id("att"),
          fileName: { type: "string" },
          contentType: { type: "string" },
          size: { type: "integer" },
          url: { type: "string", description: "Signed, expires after 12 hours" },
          isImage: { type: "boolean" },
        },
      },
      Message: {
        type: "object",
        properties: {
          id: id("msg"),
          conversationId: id("cnv"),
          authorType: { enum: ["contact", "agent", "system"] },
          agent: nullable(ref("PublicAgent")),
          kind: { enum: ["text", "note", "event"], description: "note = internal, never shown to the customer" },
          body: { type: "string" },
          event: nullable({ type: "object" }),
          attachments: { type: "array", items: ref("Attachment") },
          clientId: nullable({ type: "string" }),
          createdAt: ms,
        },
      },
      Conversation: {
        type: "object",
        properties: {
          id: id("cnv"),
          status: { enum: ["open", "snoozed", "resolved"] },
          channel: { type: "string" },
          contact: ref("Contact"),
          assignee: nullable(ref("PublicAgent")),
          createdAt: ms,
          updatedAt: ms,
          lastMessageAt: ms,
          unread: { type: "boolean" },
          snoozedUntil: nullable(ms),
        },
      },
      ApiKey: {
        type: "object",
        properties: {
          id: id("key"),
          name: { type: "string" },
          prefix: { type: "string" },
          scopes: { type: "array", items: { enum: [...API_SCOPES] } },
          bot: ref("PublicAgent"),
          createdAt: ms,
          expiresAt: nullable(ms),
          lastUsedAt: nullable(ms),
          revokedAt: nullable(ms),
        },
      },
      WebhookEndpoint: {
        type: "object",
        properties: {
          id: id("whe"),
          url: { type: "string" },
          description: nullable({ type: "string" }),
          events: { type: "array", items: { type: "string" } },
          status: { enum: ["enabled", "disabled"] },
          disabledReason: nullable({ type: "string" }),
          apiKeyId: nullable(id("key")),
          createdAt: ms,
          updatedAt: ms,
        },
      },
      WebhookEndpointWithSecret: {
        type: "object",
        properties: { endpoint: ref("WebhookEndpoint"), secret: { type: "string", description: "Shown once" } },
      },
      AuditEntry: {
        type: "object",
        properties: {
          id: id("aud"),
          actor: {
            type: "object",
            properties: { type: { enum: ["agent", "api_key", "system"] }, id: nullable({ type: "string" }), name: nullable({ type: "string" }) },
          },
          action: { enum: [...AUDIT_ACTIONS] },
          target: nullable({ type: "object", properties: { type: { type: "string" }, id: nullable({ type: "string" }) } }),
          details: { type: "object", additionalProperties: true, description: "Changed keys, old and new roles, failure reasons; never secrets" },
          ip: nullable({ type: "string" }),
          userAgent: nullable({ type: "string" }),
          createdAt: ms,
        },
      },
      SsoSettings: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          issuer: { type: "string" },
          clientId: { type: "string" },
          hasClientSecret: { type: "boolean", description: "The secret itself is never returned" },
          allowedDomains: { type: "array", items: { type: "string" } },
          requireSso: { type: "boolean", description: "Everyone except owners signs in with SSO" },
          createRole: nullable({ enum: ["agent", "viewer"] }),
          callbackUrl: { type: "string" },
        },
      },
      WebhookDelivery: {
        type: "object",
        properties: {
          id: id("whd"),
          eventId: id("evt"),
          eventType: { type: "string" },
          status: { enum: ["pending", "succeeded", "failed"] },
          attempts: { type: "integer" },
          nextAttemptAt: nullable(ms),
          lastStatusCode: nullable({ type: "integer" }),
          lastError: nullable({ type: "string" }),
          createdAt: ms,
          completedAt: nullable(ms),
        },
      },
    },
  },
  paths: {
    "/key": {
      get: op("getKey", null, "The calling key, its bot and the workspace name", {
        responses: {
          "200": ok({ type: "object", properties: { apiKey: ref("ApiKey"), workspace: { type: "object", properties: { name: { type: "string" } } } } }),
          ...errors,
        },
      }),
    },
    "/assistant": {
      get: op("getAssistant", "assistant:write", "The AI assistant's settings (the OpenRouter key is never returned)", { responses: { "200": ok({ type: "object" }), ...errors } }),
      patch: op("updateAssistant", "assistant:write", "Turn it on or off, name, instructions, OpenRouter model, anonymous visitors, daily budget", {
        requestBody: { content: json({ type: "object" }) },
        responses: { "200": ok({ type: "object" }), ...errors },
      }),
    },
    "/assistant/openrouter-key": {
      put: op("setAssistantKey", "assistant:write", "Set the OpenRouter key (checked with OpenRouter, stored encrypted, never returned)", {
        requestBody: { content: json({ type: "object", required: ["key"], properties: { key: { type: "string" } } }) },
        responses: { "200": ok({ type: "object" }), ...errors },
      }),
      delete: op("clearAssistantKey", "assistant:write", "Remove the OpenRouter key", { responses: { "200": ok({ type: "object" }), ...errors } }),
    },
    "/assistant/usage": {
      get: op("getAssistantUsage", "assistant:write", "Today's replies and cost against the daily budget", { responses: { "200": ok({ type: "object" }), ...errors } }),
    },
    "/assistant/preview": {
      post: op("previewAssistant", "assistant:write", "Ask a test question (nothing saved, nothing sent to customers)", {
        requestBody: { content: json({ type: "object", required: ["message"], properties: { message: { type: "string", maxLength: 2000 } } }) },
        responses: { "200": ok({ type: "object" }), ...errors },
      }),
    },
    "/assistant/knowledge": {
      get: op("listKnowledge", "assistant:write", "FAQ entries and articles", { responses: { "200": ok({ type: "object" }), ...errors } }),
      post: op("createKnowledge", "assistant:write", "Add an FAQ entry or an article", {
        requestBody: { content: json({ type: "object", required: ["kind", "title", "body"], properties: { kind: { enum: ["faq", "article"] }, title: { type: "string" }, body: { type: "string" }, locale: { enum: ["en", "fr", null], description: "Language; null for every language" } } }) },
        responses: { "201": ok({ type: "object" }, "Created"), ...errors },
      }),
    },
    "/assistant/tools": {
      get: op("listAssistantTools", "assistant:write", "Tools the assistant may call", { responses: { "200": ok({ type: "object" }), ...errors } }),
      post: op("createAssistantTool", "assistant:write", "Add a tool: Yunidesk POSTs signed calls to its https URL", {
        requestBody: { content: json({ type: "object", required: ["name", "description", "inputSchema", "url"] }) },
        responses: { "201": ok({ type: "object" }, "Created"), ...errors },
      }),
    },
    "/assistant/tools/roll-secret": {
      post: op("rollAssistantToolSecret", "assistant:write", "New secret tool calls are signed with (returned once)", { responses: { "200": ok({ type: "object" }), ...errors } }),
    },
    "/events": {
      get: op("listEvents", null, "Every event this server sends: names (en/fr), descriptions and the fields each carries", {
        responses: { "200": ok({ type: "object", properties: { items: { type: "array", items: { type: "object" } } } }), ...errors },
      }),
    },
    "/teammates": {
      get: op("listTeammates", "conversations:read", "People who can be assigned conversations", {
        responses: { "200": ok({ type: "object", properties: { items: { type: "array", items: ref("PublicAgent") } } }), ...errors },
      }),
    },
    "/conversations": {
      get: op("listConversations", "conversations:read", "List conversations, newest activity first", {
        parameters: [
          { name: "view", in: "query", schema: { enum: ["mine", "unassigned", "open", "snoozed", "resolved", "all"], default: "open" } },
          { name: "q", in: "query", schema: { type: "string", maxLength: 200 }, description: "Contact name/email or message text" },
          { name: "contactId", in: "query", schema: id("ctc") },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": ok(page("Conversation")), ...errors },
      }),
    },
    "/conversations/counts": {
      get: op("getConversationCounts", "conversations:read", "Inbox counts", {
        responses: { "200": ok({ type: "object", additionalProperties: { type: "integer" } }), ...errors },
      }),
    },
    "/conversations/{conversationId}": {
      get: op("getConversation", "conversations:read", "One conversation", {
        parameters: [pathId("conversationId", "cnv")],
        responses: { "200": ok(ref("Conversation")), ...errors },
      }),
      patch: op("updateConversation", "conversations:write", "Assign, snooze, resolve or reopen", {
        parameters: [pathId("conversationId", "cnv")],
        requestBody: { content: json(conversationPatch) },
        responses: { "200": ok(ref("Conversation")), ...errors },
      }),
    },
    "/conversations/{conversationId}/messages": {
      get: op("listMessages", "conversations:read", "Messages, oldest to newest (includes notes and events)", {
        parameters: [pathId("conversationId", "cnv"), { name: "before", in: "query", schema: id("msg") }],
        responses: { "200": ok(page("Message")), ...errors },
      }),
      post: op("sendMessage", "conversations:write", "Reply to the customer (text) or add an internal note", {
        parameters: [pathId("conversationId", "cnv")],
        requestBody: {
          content: json({
            type: "object",
            required: ["clientId"],
            properties: {
              body: { type: "string", maxLength: 5000 },
              kind: { enum: ["text", "note"], default: "text" },
              attachmentIds: { type: "array", maxItems: 5, items: id("att") },
              clientId: { type: "string", minLength: 8, maxLength: 64, description: "Your id for this message; retries with the same id are not duplicated" },
            },
          }),
        },
        responses: {
          "201": ok({ type: "object", properties: { conversation: ref("Conversation"), message: ref("Message") } }, "Created"),
          ...errors,
        },
      }),
    },
    "/attachments": {
      post: op("uploadAttachment", "conversations:write", "Upload a file to attach to the next message", {
        requestBody: {
          content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } },
        },
        responses: { "201": ok(ref("Attachment"), "Created"), ...errors },
      }),
    },
    "/contacts": {
      get: op("listContacts", "contacts:read", "List contacts who have conversations", {
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": ok(page("Contact")), ...errors },
      }),
    },
    "/contacts/{contactId}": {
      get: op("getContact", "contacts:read", "One contact and their conversations", {
        parameters: [pathId("contactId", "ctc")],
        responses: {
          "200": ok({ type: "object", properties: { contact: ref("Contact"), conversations: { type: "array", items: ref("Conversation") } } }),
          ...errors,
        },
      }),
    },
    "/webhook-endpoints": {
      get: op("listWebhookEndpoints", "webhooks:write", "Endpoints this key created", {
        responses: { "200": ok({ type: "object", properties: { items: { type: "array", items: ref("WebhookEndpoint") } } }), ...errors },
      }),
      post: op("createWebhookEndpoint", "webhooks:write", "Create an endpoint (the signing secret is returned once)", {
        requestBody: { content: json(endpointInput) },
        responses: { "201": ok(ref("WebhookEndpointWithSecret"), "Created"), ...errors },
      }),
    },
    "/webhook-endpoints/{endpointId}": {
      get: op("getWebhookEndpoint", "webhooks:write", "One endpoint", {
        parameters: [pathId("endpointId", "whe")],
        responses: { "200": ok(ref("WebhookEndpoint")), ...errors },
      }),
      patch: op("updateWebhookEndpoint", "webhooks:write", "Change the URL, events or description, or enable/disable", {
        parameters: [pathId("endpointId", "whe")],
        requestBody: { content: json({ ...endpointInput, required: [], properties: { ...endpointInput.properties, enabled: { type: "boolean" } } }) },
        responses: { "200": ok(ref("WebhookEndpoint")), ...errors },
      }),
      delete: op("deleteWebhookEndpoint", "webhooks:write", "Delete an endpoint and its delivery log", {
        parameters: [pathId("endpointId", "whe")],
        responses: { "200": ok({ type: "object" }), ...errors },
      }),
    },
    "/webhook-endpoints/{endpointId}/roll-secret": {
      post: op("rollWebhookEndpointSecret", "webhooks:write", "New secret; the old one keeps signing for up to 24 h", {
        parameters: [pathId("endpointId", "whe")],
        requestBody: { content: json({ type: "object", properties: { expireCurrentInHours: { type: "integer", minimum: 0, maximum: 24, default: 24 } } }) },
        responses: { "200": ok(ref("WebhookEndpointWithSecret")), ...errors },
      }),
    },
    "/webhook-endpoints/{endpointId}/test": {
      post: op("testWebhookEndpoint", "webhooks:write", "Send a ping event", {
        parameters: [pathId("endpointId", "whe")],
        responses: { "200": ok(ref("WebhookDelivery")), ...errors },
      }),
    },
    "/webhook-endpoints/{endpointId}/deliveries": {
      get: op("listWebhookDeliveries", "webhooks:write", "Last 50 deliveries", {
        parameters: [pathId("endpointId", "whe")],
        responses: { "200": ok({ type: "object", properties: { items: { type: "array", items: ref("WebhookDelivery") } } }), ...errors },
      }),
    },
    // ---- Session only (dashboard): audit log and single sign-on ----
    "/audit-log": {
      get: sessionOp("listAuditLog", "Audit log, newest first (owners and admins)", {
        parameters: auditFilters([{ name: "cursor", in: "query", schema: { type: "string" } }]),
        responses: { "200": ok(page("AuditEntry")), ...errors },
      }),
    },
    "/audit-log/export": {
      get: sessionOp("exportAuditLog", "The newest 10,000 matching entries as CSV (owners and admins)", {
        parameters: auditFilters([]),
        responses: { "200": { description: "CSV", content: { "text/csv": { schema: { type: "string" } } } }, ...errors },
      }),
    },
    "/sso": {
      get: sessionOp("getSso", "Single sign-on settings (owners)", { responses: { "200": ok(ref("SsoSettings")), ...errors } }),
      put: sessionOp("updateSso", "Change single sign-on settings (owners); clientSecret is write-only", {
        requestBody: {
          content: json({
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              issuer: { type: "string" },
              clientId: { type: "string" },
              clientSecret: nullable({ type: "string" }),
              allowedDomains: { type: "array", items: { type: "string" } },
              requireSso: { type: "boolean" },
              createRole: nullable({ enum: ["agent", "viewer"] }),
            },
          }),
        },
        responses: { "200": ok(ref("SsoSettings")), ...errors },
      }),
    },
    "/sso/test": {
      post: sessionOp("testSso", "Fetch the provider's discovery document (owners)", {
        requestBody: { content: json({ type: "object", properties: { issuer: { type: "string" } } }) },
        responses: { "200": ok({ type: "object" }), ...errors },
      }),
    },
    "/auth/sso/start": {
      get: {
        operationId: "ssoStart",
        summary: "Browser sign-in: redirects to the identity provider (authorization code + PKCE)",
        security: [],
        responses: { "302": { description: "To the provider, or to /login?sso_error=<code>" } },
      },
    },
    "/auth/sso/callback": {
      get: {
        operationId: "ssoCallback",
        summary: "The provider's redirect URI: verifies the ID token and starts a session",
        security: [],
        responses: { "302": { description: "To the dashboard, or to /login?sso_error=<code>" } },
      },
    },
  },
  webhooks: {
    "conversation.created": webhookEvent("conversation.created", {
      type: "object",
      properties: { conversationId: id("cnv"), contactId: id("ctc"), channel: { type: "string" }, contact: contactSummary },
    }),
    "message.created": webhookEvent("message.created", {
      type: "object",
      description: "Messages visible to the customer only (not notes). Check `actor` to ignore your own bot's replies.",
      properties: {
        conversationId: id("cnv"),
        contactId: id("ctc"),
        actor,
        contact: contactSummary,
        message: {
          type: "object",
          properties: {
            id: id("msg"),
            authorType: { enum: ["contact", "agent", "system"] },
            agentId: nullable(id("agt")),
            body: { type: "string" },
            attachmentCount: { type: "integer" },
            createdAt: ms,
          },
        },
      },
    }),
    "conversation.updated": webhookEvent("conversation.updated", {
      type: "object",
      properties: {
        conversationId: id("cnv"),
        contactId: id("ctc"),
        actor,
        status: { enum: ["open", "snoozed", "resolved"] },
        assigneeId: nullable(id("agt")),
      },
    }),
    "conversation.unread_reply": webhookEvent("conversation.unread_reply", {
      type: "object",
      description: "A team reply still unread after 2 minutes; send your push notification from here.",
      properties: { conversationId: id("cnv"), contact: contactSummary, agentName: nullable({ type: "string" }), preview: nullable({ type: "string" }) },
    }),
    "conversation.rated": webhookEvent("conversation.rated", {
      type: "object",
      properties: { conversationId: id("cnv"), score: { enum: [1, 2, 3] }, comment: nullable({ type: "string" }) },
    }),
  },
} as const;
