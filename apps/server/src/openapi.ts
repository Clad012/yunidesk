import { API_SCOPES, CHANNELS, CONVERSATION_FIELD_TYPES, CONVERSATION_PRIORITIES, MAX_REPORT_DAYS, TAG_COLORS } from "yunidesk";
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

const conversationPatch = {
  type: "object",
  properties: {
    status: { enum: ["open", "snoozed", "resolved"] },
    snoozedUntil: nullable(ms),
    assigneeId: nullable({ ...id("agt"), description: "A teammate id from GET /teammates" }),
    priority: { enum: [...CONVERSATION_PRIORITIES], description: "Adds an internal timeline event; never shown to the customer" },
    customFields: {
      type: "object",
      description: "Merged into the stored values; null clears one. Keys must be defined fields (GET /conversation-fields).",
      additionalProperties: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }] },
    },
  },
};

// Team-only labels: also in webhook payloads, never in what customers receive.
const priority = { enum: [...CONVERSATION_PRIORITIES] };
const customFields = {
  type: "object",
  description: "Values keyed by field key: text, number, select (one of the options), checkbox (boolean), date (YYYY-MM-DD)",
  additionalProperties: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] },
};
const webhookLabels = {
  priority,
  tags: { type: "array", items: { type: "string" }, description: "Tag names, alphabetical" },
  customFields,
};
const tagInput = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string", minLength: 1, maxLength: 40 }, color: { enum: [...TAG_COLORS], default: "gray" } },
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

// ---- Reports ----
const reportParameters = [
  { name: "from", in: "query", required: true, schema: { type: "string", format: "date" }, description: "First day, YYYY-MM-DD (in tz)" },
  { name: "to", in: "query", required: true, schema: { type: "string", format: "date" }, description: `Last day, included; at most ${MAX_REPORT_DAYS} days after from` },
  { name: "tz", in: "query", schema: { type: "string", default: "UTC" }, description: "IANA time zone the days are counted in, e.g. Europe/Paris" },
  { name: "channel", in: "query", schema: { enum: [...CHANNELS] } },
  { name: "tagId", in: "query", schema: id("tag"), description: "Only conversations with this tag" },
  { name: "assigneeId", in: "query", schema: { type: "string" }, description: "A teammate id, or none for unassigned conversations" },
];
const csvParameter = { name: "format", in: "query", schema: { enum: ["json", "csv"], default: "json" }, description: "csv: a spreadsheet download" };
const durationStats = {
  type: "object",
  description: "Milliseconds; median and 90th percentile (linear interpolation), null when count is 0",
  properties: { count: { type: "integer" }, median: nullable({ type: "number" }), p90: nullable({ type: "number" }) },
};
const ratio = nullable({ type: "number", minimum: 0, maximum: 1 });
const reportPeriod = {
  type: "object",
  properties: {
    from: { type: "string", format: "date" },
    to: { type: "string", format: "date" },
    created: { type: "integer", description: "Conversations created in the period" },
    resolved: { type: "integer", description: "Conversations resolved in the period (and still resolved)" },
    reopened: { type: "integer", description: "Conversations created in the period and reopened at least once" },
    firstResponse: { ...durationStats, description: "First contact message to the first reply from a person (AI, notes and bots don't count); conversations created in the period" },
    resolution: { ...durationStats, description: "Created to resolved; conversations resolved in the period" },
    satisfaction: {
      type: "object",
      description: "Ratings given in the period. csat = great / rated",
      properties: { rated: { type: "integer" }, great: { type: "integer" }, okay: { type: "integer" }, bad: { type: "integer" }, csat: ratio },
    },
    assistant: {
      type: "object",
      description: "Conversations created in the period the AI assistant replied to or handed off",
      properties: {
        involved: { type: "integer" },
        resolved: { type: "integer", description: "Resolved without any reply from a person, not handed off" },
        handedOff: { type: "integer" },
        resolutionRate: ratio,
      },
    },
  },
};
const reportItems = (item: object) => ok({ type: "object", properties: { items: { type: "array", items: item } } }, "OK (JSON, or text/csv with format=csv)");

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
          priority,
          tags: { type: "array", items: ref("Tag") },
          customFields,
        },
      },
      Tag: {
        type: "object",
        properties: { id: id("tag"), name: { type: "string" }, color: { enum: [...TAG_COLORS] } },
      },
      TagWithUsage: {
        allOf: [
          ref("Tag"),
          {
            type: "object",
            properties: {
              conversationCount: { type: "integer" },
              openCount: { type: "integer", description: "Open conversations carrying it" },
              createdAt: ms,
            },
          },
        ],
      },
      ConversationField: {
        type: "object",
        properties: {
          id: id("fld"),
          key: { type: "string", pattern: "^[a-z][a-z0-9_]{0,39}$" },
          label: { type: "string" },
          type: { enum: [...CONVERSATION_FIELD_TYPES] },
          options: { type: "array", items: { type: "string" }, description: "Choices of a select field" },
          position: { type: "integer" },
          createdAt: ms,
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
          { name: "tag", in: "query", schema: id("tag"), description: "Only conversations with this tag" },
          { name: "priority", in: "query", schema: priority },
          { name: "sort", in: "query", schema: { enum: ["priority"] }, description: "Urgent, then high, normal, low; newest first within each" },
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
      patch: op("updateConversation", "conversations:write", "Assign, snooze, resolve, reopen, set the priority or custom field values", {
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
    "/conversations/{conversationId}/tags": {
      post: op("tagConversation", "conversations:write", "Add a tag, by id or by name (a missing name is created)", {
        parameters: [pathId("conversationId", "cnv")],
        requestBody: {
          content: json({
            type: "object",
            description: "Send tagId or name, not both",
            properties: { tagId: id("tag"), name: { type: "string", maxLength: 40 }, color: { enum: [...TAG_COLORS] } },
          }),
        },
        responses: { "200": ok(ref("Conversation")), ...errors },
      }),
    },
    "/conversations/{conversationId}/tags/{tagId}": {
      delete: op("untagConversation", "conversations:write", "Remove a tag", {
        parameters: [pathId("conversationId", "cnv"), pathId("tagId", "tag")],
        responses: { "200": ok(ref("Conversation")), ...errors },
      }),
    },
    "/tags": {
      get: op("listTags", "conversations:read", "Every tag, alphabetical, with how many conversations carry it", {
        responses: { "200": ok({ type: "object", properties: { items: { type: "array", items: ref("TagWithUsage") } } }), ...errors },
      }),
      post: op("createTag", "conversations:write", "Create a tag (renaming and deleting are owner settings)", {
        requestBody: { content: json(tagInput) },
        responses: { "201": ok(ref("TagWithUsage"), "Created"), ...errors },
      }),
    },
    "/conversation-fields": {
      get: op("listConversationFields", "conversations:read", "Custom fields defined by the owners, in display order", {
        responses: { "200": ok({ type: "object", properties: { items: { type: "array", items: ref("ConversationField") } } }), ...errors },
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
    "/reports/summary": {
      get: op("getReportSummary", "reports:read", "Headline numbers for a period, the period just before it, and what is open now", {
        parameters: reportParameters,
        responses: {
          "200": ok({
            type: "object",
            properties: {
              timeZone: { type: "string" },
              current: reportPeriod,
              previous: reportPeriod,
              snapshot: { type: "object", properties: { open: { type: "integer" }, snoozed: { type: "integer" } } },
            },
          }),
          ...errors,
        },
      }),
    },
    "/reports/volume": {
      get: op("getReportVolume", "reports:read", "Conversations created and resolved per day, and created per weekday and hour", {
        parameters: reportParameters,
        responses: {
          "200": ok({
            type: "object",
            properties: {
              timeZone: { type: "string" },
              days: {
                type: "array",
                items: { type: "object", properties: { date: { type: "string", format: "date" }, created: { type: "integer" }, resolved: { type: "integer" } } },
              },
              busiestHours: {
                type: "array",
                description: "7 rows (Monday first) of 24 hourly counts of conversations created, in tz",
                items: { type: "array", items: { type: "integer" } },
              },
            },
          }),
          ...errors,
        },
      }),
    },
    "/reports/teammates": {
      get: op("getReportTeammates", "reports:read", "Per teammate: assigned, replied, resolved, median first response, satisfaction", {
        parameters: [...reportParameters, csvParameter],
        responses: {
          "200": reportItems({
            type: "object",
            properties: {
              agent: ref("PublicAgent"),
              assigned: { type: "integer" },
              replied: { type: "integer" },
              resolved: { type: "integer" },
              firstResponseMedian: nullable({ type: "number", description: "ms" }),
              rated: { type: "integer" },
              csat: ratio,
            },
          }),
          ...errors,
        },
      }),
    },
    "/reports/tags": {
      get: op("getReportTags", "reports:read", "Per tag: conversations created, resolved and their median resolution time", {
        parameters: [...reportParameters, csvParameter],
        responses: {
          "200": reportItems({
            type: "object",
            properties: {
              tag: { type: "object", properties: { id: id("tag"), name: { type: "string" }, color: { enum: [...TAG_COLORS] } } },
              conversations: { type: "integer" },
              resolved: { type: "integer" },
              resolutionMedian: nullable({ type: "number", description: "ms" }),
            },
          }),
          ...errors,
        },
      }),
    },
  },
  webhooks: {
    "conversation.created": webhookEvent("conversation.created", {
      type: "object",
      properties: { conversationId: id("cnv"), contactId: id("ctc"), channel: { type: "string" }, contact: contactSummary, ...webhookLabels },
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
        ...webhookLabels,
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
