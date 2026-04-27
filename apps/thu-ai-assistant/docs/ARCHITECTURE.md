# THU AI Assistant Architecture

`thu-ai-assistant` is a small web service that turns THU Info capabilities into AI-callable tools.

## Runtime Flow

1. `src/server.ts` configures Express middleware and serves `public/index.html`.
2. `src/routes/*` owns HTTP endpoint handlers.
3. `src/session/session-manager.ts` owns login state and authenticated `InfoHelper` instances.
4. `src/agent/ai-service.ts` runs the chat loop.
5. `src/agent/llm-client.ts` sends messages and tool definitions to the LLM provider.
6. `src/agent/tools/*` defines each callable tool and routes it to a campus service.
7. `src/services/thu/data-service.ts` wraps `@thu-info/lib` calls into JSON-friendly results.
8. `src/services/sports-selenium/sports-selenium-service.ts` contains the Selenium sports automation path.

## Directory Boundaries

- `agent/`: model prompts, provider calls, tool loop, and tool registry.
- `agent/tools/`: one file per model-callable function tool.
- `config/`: environment and runtime configuration.
- `routes/`: HTTP API modules grouped by feature.
- `session/`: authenticated user session lifecycle.
- `services/`: concrete integrations with THU systems or browser automation.
- `public/`: current static demo UI.

## Adding A New Tool

1. Add the underlying campus operation in `services/` if it does not already exist.
2. Add a new `*.tool.ts` file under `agent/tools/`.
3. Export an `AgentTool` with `definition` and `run`.
4. Register it in `agent/tools/index.ts`.
5. Update `agent/prompt.ts` only if the model needs high-level behavior guidance.
