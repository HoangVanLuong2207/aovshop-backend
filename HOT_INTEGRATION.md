# HOT integration — implementation status

## Implemented locally (not deployed)

- Dedicated HOT service authentication (`HOT_SERVICE_TOKEN`), independent of Checkpass.
- `POST /api/hot/sso/ticket`: authenticated SP1S users only; static admin API credentials are rejected.
- `POST /api/integrations/hot/sso/exchange`: one-time hashed ticket, 60-second expiry, HOT audience, exact normalized callback/state binding, current token-version check.
- `POST /api/integrations/hot/session/validate`: current identity/role and token-version revalidation for application sessions.
- Additive, repeatable migration; startup runs it before starting Express.
- Isolated tests: `npm run test:hot`; type check: `npx tsc --noEmit`.
- Cash-only HOT payment API with write-transaction serialization, shared balance holds, signed purchase/refund ledger entries, full refunds, and immutable reference/user/amount binding. No Checkpass bonus is spent.

## Configuration

Set a separate random `HOT_SERVICE_TOKEN` in SP1S and the eventual HOT server integration; never send it to a browser. Unconfigured service endpoints fail closed.

`HOT_ALLOWED_ORIGINS` defaults to `https://hot.sp1s.shop`. HTTPS callbacks must use `/auth/callback` with a random 20–128-character base64url `state`. Add `https://tlttool.com` explicitly only after the domain and callback are provisioned.

The connector submits `{ "return_url": "https://hot.sp1s.shop/auth/callback?state=..." }` with the normal SP1S user bearer token. It redirects to the returned `redirect_url`. The HOT backend exchanges `{ "code": "...", "return_url": "..." }` using its service bearer credential; `return_url` is the original callback including state, without code.

HOT validates state against the initiating browser cookie, establishes its own Secure/HttpOnly session, and calls `/session/validate` with `{ "user_id": 1, "token_version": 0 }` on authenticated requests. The application-side session module and Vue `/hot/connect` connector are implemented locally, behind a disabled HOT shop feature flag. PostgreSQL/browser integration testing and deployment remain pending.

## Billing API contract

All routes below are server-to-server POSTs beneath `/api/integrations/hot/billing/`, protected by `HOT_SERVICE_TOKEN`. A compromised HOT service credential can debit/refund user wallets; it must never be exposed to clients or CTVs.

- `reserve`: `{ "user_id": 1, "external_reference": "order-uuid", "amount_tenths": 1000 }`.
- `capture`, `release`, `refund`, `status`: `{ "user_id": 1, "external_reference": "order-uuid" }`; optional `amount_tenths` is checked for equality if supplied.
- References are 1–128 alphanumeric/underscore/hyphen characters and identify exactly one immutable HOT payment. Reusing a reference with a different user/amount returns 409. Retries do not create another hold, charge or refund.
- Amounts are positive safe integers in **tenths of VND**, not VND. The trusted HOT backend must compute these from the snapshotted price; never forward a browser-supplied amount.
- Reserve lasts 15 minutes. Expired holds no longer reduce available cash and cannot be captured. Status reports `expired` for an expired reserved payment; release can finalize its bookkeeping. Reusing an expired/released/refunded reference never creates a new reservation.
- Capture converts the existing active hold into one cash debit and purchase ledger entry. Release only applies before capture. Refund is full and only applies after capture; repeated refunds return the existing result.
- Status returns the persisted payment, ledger IDs and a current cash-only wallet snapshot. A missing reference returns 404 and does not create anything. After a network timeout, the HOT reconciler must query status before deciding its next action.
- Reserve checks every service's active unexpired cash holds (excluding bonus portions). Capture preserves other services' cash holds as well. End-to-end concurrent checkout tests against actual Checkpass/shop routes are still pending; current shared-hold tests insert representative rows directly.
- Responses include `ok`, `payment`, and `wallet` (`cash_balance_tenths`, `held_cash_tenths`, `available_cash_tenths`). These service APIs do not enforce HOT order ownership or customer refund policy: those checks must exist in the HOT application before exposing user actions.

## Not implemented yet

Bank selection/deposit integration, standalone user-wallet endpoint, CTV keys, complete refund/review/final-state lifecycle, and shop/admin frontend. HOT session/connector, versioned pricing, owner-scoped orders, and an opt-in discovery/payment reconciler with draft-job activation gate are implemented locally but not enabled/deployed. The reconciler creates draft jobs and only queues after verifying captured payment; real PostgreSQL and cross-service/browser tests remain pending, including the SQL payment guard. Automatic refund for captured-but-unaccepted orders is not complete. Existing production jobs/workers are unchanged. The integration APIs alone do not make HOT a paid shop.

## Verification and deployment gates

- HOT tests: 10/10 passing (SSO replay/callback/expiry/revocation, payment retry/concurrency, cash-only spending, shared holds, invalid transitions, debit/refund ledger rollback, protection after legacy balance changes).
- TypeScript: `npx tsc --noEmit` passing.
- Existing security tests: 22/23 passing. `expired and already completed deposits cannot be credited` expects expired deposits to be rejected, while the existing webhook explicitly accepts unpaid expired references. No webhook policy changes were made here. Resolve policy/test discrepancy before rollout.
- Root Dockerfile/package/startup target root `src/`; actual production deployment root must still be confirmed before deploying. Nested `aovshop-backend` has not been synchronized or overwritten.
- No production migration or restart performed for this work. Preserve existing unrelated deletions and untracked build output.
