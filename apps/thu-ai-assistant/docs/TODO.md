# THU AI Assistant TODO

This file tracks the concrete engineering work needed to turn `thu-ai-assistant` from a working demo into a maintainable action-taking campus agent.

## Agent Tools

- [ ] Add a sports booking tool that can reserve a selected venue/time slot after explicit user confirmation.
- [ ] Add a sports booking records tool for checking current reservations.
- [ ] Add a sports cancellation tool, gated behind explicit confirmation.
- [ ] Add a library room resource query tool.
- [ ] Add a library room booking tool, gated behind explicit confirmation.
- [ ] Add a library room cancellation tool, gated behind explicit confirmation.
- [ ] Add campus card transaction query tools.
- [ ] Add network account and online device tools if they are useful in the assistant flow.
- [ ] Define a shared confirmation protocol for irreversible actions such as booking, cancellation, and payment.
- [ ] Add result schemas for every tool so model-facing output stays compact and predictable.

## Service Layer

- [ ] Split `src/services/thu/data-service.ts` by domain once booking flows are added:
  - [ ] `schedule.service.ts`
  - [ ] `sports.service.ts`
  - [ ] `card.service.ts`
  - [ ] `library.service.ts`
  - [ ] `classroom.service.ts`
  - [ ] `news.service.ts`
- [ ] Move sports venue metadata into a single shared source to avoid duplicate lists.
- [ ] Stabilize the sports resource payload mapping for the current THU sports frontend API.
- [ ] Decide whether Selenium sports booking remains the primary implementation or becomes a fallback.
- [ ] Add typed service return models instead of ad hoc object literals.

## LLM And Prompting

- [ ] Add provider abstraction for GLM, DeepSeek, and future OpenAI-compatible providers.
- [ ] Move provider selection into `src/config/env.ts`.
- [ ] Add `.env` loading or document the exact shell-based startup path.
- [ ] Keep the system prompt focused on behavior and move tool-specific details into tool descriptions where possible.
- [ ] Add guardrails for user intent: query, prepare action, confirm action, execute action.
- [ ] Add a max tool-round failure response that tells the user what failed and what to retry.

## API And Session

- [ ] Add `GET /api/health` for frontend startup checks and live verification.
- [ ] Add a shared authenticated route helper to remove repeated session checks in route files.
- [ ] Add request validation helpers for route payloads.
- [ ] Add structured API error responses with stable `code` and `message` fields.
- [ ] Decide whether sports Selenium login state should be per user session instead of a singleton service.
- [ ] Add session cleanup tests for expiration and logout behavior.

## Frontend

- [ ] Split `public/index.html` into `index.html`, `styles.css`, and `app.js`.
- [ ] Add a startup hint when the page is opened via `file://` instead of the Express server.
- [ ] Add UI for confirmation flows before bookings, cancellations, or payments.
- [ ] Add better rendering for structured tool results.
- [ ] Decide whether to migrate the frontend to a small Vite app once the agent flows stabilize.

## Testing And Verification

- [ ] Add unit tests for `agent/tools/index.ts` registry behavior.
- [ ] Add unit tests for relative date parsing.
- [ ] Add route tests for login status, chat auth gating, and clear history.
- [ ] Add service-level tests using the `InfoHelper` mock account where possible.
- [ ] Add a lightweight build check to CI for `apps/thu-ai-assistant`.
- [ ] Add manual verification docs for real THU login, 2FA, campus card recharge, sports query, and sports booking.

## Repository Hygiene

- [ ] Decide whether `apps/thu-ai-assistant/dist/` should remain tracked; current `.gitignore` treats it as generated output.
- [ ] Keep `.env`, `.cookies`, logs, screenshots, and local npm cache out of git.
- [ ] Add a short developer setup section for local install/build/run.
- [ ] Resolve the mixed npm/yarn workflow and document the preferred command set.
- [ ] Avoid committing generated lockfile churn unless dependencies intentionally change.

## Known Risks

- [ ] THU sports endpoints may drift; verify against the live frontend before changing API behavior.
- [ ] Booking/payment/cancellation tools can perform real-world actions and must require explicit confirmation.
- [ ] Selenium automation may be brittle under UI or login changes.
- [ ] Session and credential handling should be reviewed before exposing the assistant beyond local development.
