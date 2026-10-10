# Yunidesk

Self-hosted support desk (Intercom/Crisp style) on Cloudflare. Read `docs/ARCHITECTURE.md` first.

## Commands
```bash
pnpm dev                                   # server :8787 + dashboard :5173 + widget :5174
pnpm --dir apps/server db:migrate:local    # apply D1 migrations locally
pnpm build                                 # dashboard + widget into apps/server/public
pnpm run deploy                            # build, apply remote migrations, wrangler deploy (wrangler.jsonc)
pnpm run deploy:production                 # same with apps/server/wrangler.production.jsonc (gitignored, real ids)
pnpm release                               # publish yunidesk, yunidesk-react, yunidesk-react-native to npm
pnpm typecheck && pnpm test
```

## Rules
- This is a generic open-source project: no product-specific names, domains or ids in tracked files. Real deploy config lives in the gitignored `wrangler.production.jsonc`.
- Published packages: `packages/protocol` = `yunidesk`, `packages/react` = `yunidesk-react` (both built with tsup, `publishConfig` swaps exports to `dist`), `packages/react-native` = `yunidesk-react-native` (ships TS source). Bump versions together.
- Shared shapes live in `packages/protocol/src/types.ts`; change them there first.
- Contacts must never receive internal notes or assignment events (`CONTACT_VISIBLE_SQL`, `isVisibleToContact`).
- Every D1 query is parameterised; no string-built SQL from input.
- Widget and React Native copy comes from `packages/protocol/src/strings.ts` (en + fr). No hardcoded user-facing strings there.
- Strict TypeScript, no `any`. Small components (~150 lines). Named exports.
- Mobile UI: no borders or hairlines; use filled blocks. No sparkles icon.

## Tests
Only tests that can fail: if mutating the code they cover leaves them green, delete them. Test real logic (tokens, permissions, merging, grouping), never mocks or "it renders".
