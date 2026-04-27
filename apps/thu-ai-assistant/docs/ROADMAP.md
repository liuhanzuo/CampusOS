# THU AI Assistant Roadmap

## Implemented

- Main THU login and 2FA session flow.
- Chat endpoint with LLM tool calling loop (GLM / DeepSeek via `.env`).
- Query tools for schedule, sports resources, grades, campus card, electricity, library, news, calendar, classrooms, and sports venue list.
- Campus card recharge tool that returns a payment URL for QR rendering.
- Selenium-based sports query and booking APIs outside the agent tool loop.
- Basic route, agent, tool, config, session, and service boundaries.
- `.env` auto-loading via `dotenv` (GLM_API_KEY, THU_USER_ID, THU_PASSWORD, etc.).
- HTTP redirect handling expanded to 301/302/303/307/308 (was only 301/302).
- WebVPN hash reverse-mapping for myhome.tsinghua.edu.cn (dorm + electricity).

## In Progress

- **Electricity query**: `roam("id")` CAS flow redirects to `myhome.tsinghua.edu.cn`. The roaming step succeeds via `lb-auth/lbredirect`, but the subsequent `uFetch(ELE_REMAINDER_URL)` to the `webvpn.tsinghua.edu.cn/http/HASH/...` URL receives a login page (53877 bytes) instead of data. Root cause: `lb-auth` establishes a session with the `oauth` proxy, but the `webvpn` proxy tunnel for `myhome` is not activated — these two proxy paths do not share per-host tunnel state. The `WEBVPN_HASH_TO_ORIGIN` auto-recovery in `network.ts` should kick in on `wengine-vpn/failed`, but the `webvpn` proxy is returning 200 with a login page HTML instead of a redirect to `wengine-vpn/failed`, so the recovery path is never triggered. **Likely fix**: the electricity host (`myhome.tsinghua.edu.cn`) needs a `HOST_MAP` entry in `core.ts` so `parseUrl()` generates a `webvpn`-format URL instead of falling back to `lb-auth`, keeping the entire flow on the same proxy; or the `uFetch` for `ELE_REMAINDER_URL` needs to be routed through `lb-auth/lbredirect` as well instead of the direct `webvpn` hash URL.
- Sports API reliability and payload mapping.
- Moving remaining single-file service modules toward domain-specific services.

## Next

- Add sports booking as an agent tool after the Selenium/API path is stable.
- Add library room query and booking tools.
- Split `services/thu/data-service.ts` by domain when booking flows are added.
- Move the static frontend into separate `index.html`, `styles.css`, and `app.js` files, or migrate to a small Vite app.

## Risks

- THU sports endpoints are unstable and should be validated against the live frontend before changing behavior.
- Booking/payment/captcha tools need explicit confirmation flows before executing irreversible actions.
- Local `.env` is loaded but credentials (THU_USER_ID, THU_PASSWORD, GLM_API_KEY) must not be committed to git.
- Electricity query blocked by proxy mismatch: `roam("id")` → `lb-auth` proxy, but `ELE_REMAINDER_URL` → `webvpn` proxy; tunnel state not shared between the two.
