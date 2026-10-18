import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, Outlet, redirect } from "@tanstack/react-router";
import { ApiError } from "@/lib/api";
import { endpoints, INBOX_VIEWS, type InboxView } from "@/lib/endpoints";
import { queryClient } from "@/lib/query-client";
import { bootstrapQuery } from "@/hooks/use-bootstrap";
import { RootLayout } from "@/features/shell/root-layout";
import { AppShell } from "@/features/shell/app-shell";
import { LoginPage } from "@/features/auth/login-page";
import { SetupPage } from "@/features/auth/setup-page";
import { InvitePage } from "@/features/auth/invite-page";
import { InboxPage } from "@/features/inbox/inbox-page";
import { ConversationEmpty } from "@/features/inbox/conversation/conversation-empty";
import { ConversationRoute } from "@/features/inbox/conversation/conversation-route";
import { SettingsLayout } from "@/features/settings/settings-layout";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/features/settings/section-names";

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: RootLayout });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const status = await endpoints.authStatus().catch(() => ({ needsSetup: false }));
    if (status.needsSetup) throw redirect({ to: "/setup" });
  },
  validateSearch: (search: Record<string, unknown>): { sso_error?: string } =>
    typeof search.sso_error === "string" ? { sso_error: search.sso_error } : {},
  component: LoginPage,
});

const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/setup", component: SetupPage });
const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/invite/$token", component: InvitePage });

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(bootstrapQuery);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const status = await endpoints.authStatus().catch(() => ({ needsSetup: false }));
        throw redirect({ to: status.needsSetup ? "/setup" : "/login" });
      }
      throw error;
    }
  },
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/inbox/$view", params: { view: "mine" } });
  },
});

const inboxIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/inbox",
  beforeLoad: () => {
    throw redirect({ to: "/inbox/$view", params: { view: "mine" } });
  },
});

export interface InboxSearch {
  q?: string;
}

const inboxRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/inbox/$view",
  params: {
    parse: (raw: { view: string }): { view: InboxView } => ({
      view: (INBOX_VIEWS as readonly string[]).includes(raw.view) ? (raw.view as InboxView) : "mine",
    }),
    stringify: (params: { view: InboxView }) => ({ view: params.view }),
  },
  validateSearch: (search: Record<string, unknown>): InboxSearch =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  component: InboxPage,
});

const inboxEmptyRoute = createRoute({ getParentRoute: () => inboxRoute, path: "/", component: ConversationEmpty });
const conversationRoute = createRoute({ getParentRoute: () => inboxRoute, path: "$conversationId", component: ConversationRoute });

const contactsRoute = createRoute({ getParentRoute: () => appRoute, path: "/contacts", component: Outlet });
const contactsIndexRoute = createRoute({ getParentRoute: () => contactsRoute, path: "/", component: lazyRouteComponent(() => import("@/features/contacts/contacts-page"), "ContactsPage") });
const contactRoute = createRoute({ getParentRoute: () => contactsRoute, path: "$contactId", component: lazyRouteComponent(() => import("@/features/contacts/contact-page"), "ContactPage") });

const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: SettingsLayout });
const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/settings/$section", params: { section: "messenger" } });
  },
});
const settingsSectionRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "$section",
  params: {
    parse: (raw: { section: string }): { section: SettingsSection } => ({
      section: (SETTINGS_SECTIONS as readonly string[]).includes(raw.section) ? (raw.section as SettingsSection) : "messenger",
    }),
    stringify: (params: { section: SettingsSection }) => ({ section: params.section }),
  },
  component: lazyRouteComponent(() => import("@/features/settings/settings-section-page"), "SettingsSectionPage"),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  inviteRoute,
  appRoute.addChildren([
    indexRoute,
    inboxIndexRoute,
    inboxRoute.addChildren([inboxEmptyRoute, conversationRoute]),
    contactsRoute.addChildren([contactsIndexRoute, contactRoute]),
    settingsRoute.addChildren([settingsIndexRoute, settingsSectionRoute]),
  ]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

