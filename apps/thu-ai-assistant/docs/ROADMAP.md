# THU AI Assistant Roadmap

## Implemented

- Main THU login and 2FA session flow.
- Chat endpoint with LLM tool calling loop.
- Query tools for schedule, sports resources, grades, campus card, electricity, library, news, calendar, classrooms, and sports venue list.
- Campus card recharge tool that returns a payment URL for QR rendering.
- Selenium-based sports query and booking APIs outside the agent tool loop.
- Basic route, agent, tool, config, session, and service boundaries.

## In Progress

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
- Local `.env` loading is not wired yet; pass environment variables through the shell or process manager.
