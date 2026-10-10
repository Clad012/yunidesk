import { signUserToken } from "yunidesk/identity";

// DEV ONLY — never ship this. The secret must stay on your server: in a real app your backend
// signs the token with IDENTITY_SECRET and the app fetches it. This is the local server's default
// from apps/server/.dev.vars.example, so the demo can show an identified user without a backend.
const DEV_IDENTITY_SECRET = "change-me-identity-secret-at-least-32-chars";

export const DEMO_USER = { userId: "user_demo", name: "Jane", email: "jane@example.com" } as const;

export function signDemoUserToken(): Promise<string> {
  return signUserToken(
    { userId: DEMO_USER.userId, name: DEMO_USER.name, email: DEMO_USER.email, attributes: { plan: "demo" } },
    DEV_IDENTITY_SECRET,
    { expiresInSeconds: 3600 },
  );
}
