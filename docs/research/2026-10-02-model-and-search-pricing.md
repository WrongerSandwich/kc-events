# Model, search, and CI pricing facts (checked 2026-10-02)

Scope: inputs for the weekly KC events research job (fetch 40-60 venue pages + search leads, structured extraction, curation pass over 100-300 candidates). Facts only; no recommendations.

## 1. OpenRouter model prices (USD per 1M tokens)

Source: `GET https://openrouter.ai/api/v1/models` (public, 466 models listed), pulled 2026-10-02. `tools` = `tools` in `supported_parameters`; `JSON` = `response_format` supported; `strict` = `structured_outputs` (JSON-schema strict mode) supported. Prices are OpenRouter's default-route list price; per-provider endpoints can differ. `:batch` and `:free` variants excluded. Dates = OpenRouter `created` date.

### Cheapest-capable tier (tool calling + JSON schema, under $1 in / $5 out)

| Model ID | In | Out | Ctx | tools | JSON | strict | Added |
|---|---|---|---|---|---|---|---|
| deepseek/deepseek-v4-flash (0423) | 0.028 | 0.056 | 1M | yes | yes | yes | 2026-04 |
| qwen/qwen3.7-flash | 0.030 | 0.130 | 1M | yes | yes | no | 2026-07 |
| openai/gpt-5-nano | 0.050 | 0.400 | 400K | yes | yes | yes | 2025-08 |
| qwen/qwen3.5-flash-02-23 | 0.065 | 0.260 | 1M | yes | yes | yes | 2026-02 |
| openai/gpt-6-luna | 0.100 | 0.500 | 1.05M | yes | yes | yes | 2026-09 |
| google/gemini-2.5-flash-lite | 0.100 | 0.400 | 1M | yes | yes | yes | 2025-07 |
| qwen/qwen3.8-flash | 0.150 | 0.470 | 1M | yes | yes | yes | 2026-08 |
| z-ai/glm-5.3-flash | 0.150 | 0.500 | 1M | yes | yes | yes | 2026-08 |
| openai/gpt-5.6-luna | 0.200 | 1.200 | 1.05M | yes | yes | yes | 2026-07 |
| openai/gpt-5.4-nano | 0.200 | 1.250 | 400K | yes | yes | yes | 2026-03 |
| deepseek/deepseek-v4-pro (0423) | 0.209 | 0.418 | 1M | yes | yes | yes | 2026-04 |
| minimax/minimax-m2.7 | 0.210 | 0.840 | 205K | yes | yes | no | 2026-03 |
| openai/gpt-5-mini | 0.250 | 2.000 | 400K | yes | yes | yes | 2025-08 |
| google/gemini-3.1-flash-lite | 0.250 | 1.500 | 1M | yes | yes | yes | 2026-05 |
| deepseek/deepseek-v4.1-flash (latest DeepSeek) | 0.300 | 1.200 | 1M | yes | yes | yes | 2026-09 |
| google/gemini-2.5-flash | 0.300 | 2.500 | 1M | yes | yes | yes | 2025-06 |
| google/gemini-3.5-flash-lite | 0.300 | 2.500 | 1M | yes | yes | yes | 2026-07 |
| qwen/qwen3.7-plus | 0.320 | 1.280 | 1M | yes | yes | yes | 2026-06 |
| moonshotai/kimi-k2.6 | 0.434 | 1.828 | 262K | yes | yes | yes | 2026-04 |
| deepseek/deepseek-v4-pro-0813 | 0.660 | 1.980 | 1M | yes | yes | yes | 2026-08 |
| openai/gpt-5.4-mini | 0.750 | 4.500 | 400K | yes | yes | yes | 2026-03 |
| google/gemini-3.8-flash (latest Flash) | 0.750 | 3.750 | 1M | yes | yes | yes | 2026-09 |
| anthropic/claude-haiku-4.5 | 1.000 | 5.000 | 200K | yes | yes | yes | 2025-10 |

### Mid / frontier tier

| Model ID | In | Out | Ctx | tools | JSON | strict | Added |
|---|---|---|---|---|---|---|---|
| openai/gpt-5 | 1.250 | 10.000 | 400K | yes | yes | yes | 2025-08 |
| google/gemini-2.5-pro | 1.250 | 10.000 | 1M | yes | yes | yes | 2025-06 |
| x-ai/grok-4.20 | 1.250 | 2.500 | 2M | yes | yes | yes | 2026-03 |
| z-ai/glm-5.3 | 1.400 | 4.400 | 1M | yes | yes | yes | 2026-08 |
| qwen/qwen3.7-max | 1.475 | 4.425 | 1M | yes | yes | yes | 2026-05 |
| google/gemini-3.5-flash | 1.500 | 9.000 | 1M | yes | yes | yes | 2026-05 |
| openai/gpt-5.2 | 1.750 | 14.000 | 400K | yes | yes | yes | 2025-12 |
| anthropic/claude-sonnet-5.5 (latest Sonnet) | 2.000 | 10.000 | 1M | yes | yes | yes | 2026-09-28 |
| openai/gpt-6.1-sol (latest GPT) | 2.000 | 10.000 | 1.05M | yes | yes | yes | 2026-09-29 |
| openai/gpt-6-sol | 2.000 | 10.000 | 1.05M | yes | yes | yes | 2026-09 |
| google/gemini-3.1-pro-preview (latest Pro) | 2.000 | 12.000 | 1M | yes | yes | yes | 2026-02 |
| qwen/qwen3.8-max-0902 (latest large Qwen) | 2.000 | 6.000 | 1M | yes | yes | yes | 2026-09 |
| x-ai/grok-4.7 | 2.000 | 6.000 | 500K | yes | yes | yes | 2026-09 |
| openai/gpt-5.4 | 2.500 | 15.000 | 1.05M | yes | yes | yes | 2026-03 |
| anthropic/claude-sonnet-4.5 / 4.6 | 3.000 | 15.000 | 1M | yes | yes | yes | 2025-09 / 2026-02 |
| anthropic/claude-opus-5.5 (latest Opus) | 4.000 | 20.000 | 1M | yes | yes | yes | 2026-09-22 |
| anthropic/claude-opus-5 / 4.8 / 4.7 / 4.6 / 4.5 | 5.000 | 25.000 | 1M (4.5: 200K) | yes | yes | yes | 2025-11 to 2026-07 |
| openai/gpt-5.5 | 5.000 | 30.000 | 1.05M | yes | yes | yes | 2026-04 |
| anthropic/claude-fable-5.1 | 10.000 | 50.000 | 1M | yes | yes | yes | 2026-09 |
| openai/gpt-6-astra | 10.000 | 50.000 | 1.05M | yes | yes | yes | 2026-09 |

Notes:
- Every model above except qwen3.7-flash, minimax-m2.7, and glm-5.3-prime/flashx advertises `structured_outputs`. Older Claude (opus-4.1, sonnet-4) and kimi-k2-0711 list neither `response_format` nor `structured_outputs`.
- OpenRouter rankings (usage data through 2026-10-02): top 10 overall are Claude Opus 5.5, Claude Sonnet 5.5, Qwen3.8 Max, Claude Fable 5.1, GPT-6 Astra, GPT-6.1 Sol, Claude Opus 5, Claude Fable 5, GPT-6 Sol, GPT-5.6 Sol. The rankings page has a "Top models by task" section (includes a tool-calling category) but it did not render in a fetch; check it in a browser.
- Structured outputs doc: use `response_format: {type: "json_schema", json_schema: {name, strict: true, schema}}`. Support is per provider endpoint, not just per model; set `provider: {require_parameters: true}` to prevent routing to an endpoint that lacks it, otherwise the request fails with an unsupported-parameter error. A "Response Healing" plugin exists for non-streaming JSON repair.

## 2. OpenRouter per-request cost accounting and key limits

| Item | Fact |
|---|---|
| Enabling cost in response | Not needed. Docs state `usage: {include: true}` and `stream_options: {include_usage: true}` are **deprecated and have no effect; full usage details are always included** in every chat completion response. |
| `usage` fields | `prompt_tokens`, `completion_tokens`, `total_tokens`, `cost` (credits charged, USD), `cost_details.upstream_inference_cost`, `prompt_tokens_details.cached_tokens`, `prompt_tokens_details.cache_write_tokens`, `prompt_tokens_details.audio_tokens`, `completion_tokens_details.reasoning_tokens`. |
| Streaming | Usage arrives only in the final SSE chunk. |
| Per-key spend limit | Yes. Keys have `limit` (credit cap, null = unlimited), `limit_remaining`, `limit_reset` (`null`, `daily` [resets midnight UTC], `weekly`, `monthly`), `include_byok_in_limit`, plus `usage`, `usage_daily`, `usage_weekly`, `usage_monthly`. Settable via the Provisioning Keys API (`limit`, `limit_reset` on create/update); dashboard support not confirmed in docs. |
| Hitting the limit | API returns HTTP 402 with `metadata.limit_source: "openrouter_key_limit"`. |
| Inspect a key | `GET /api/v1/key` returns `limit`, `limit_remaining`, `usage`, `free_model_daily_requests`. |

## 3. Tavily pricing, credit costs, rate limits

| Item | Fact |
|---|---|
| Free ("Researcher") | 1,000 credits/month, no credit card. |
| Pay as you go | $0.008 per credit. |
| Project | $30/mo, 4,000 credits ($0.0075/credit). "Higher rate limits." |
| Bootstrap / Startup / Growth | $100/mo 15,000 cr; $220/mo 38,000 cr; $500/mo 100,000 cr ($0.0067 / $0.0058 / $0.005 per credit). |
| Enterprise | Custom. Students get free access. |
| Search cost | basic depth = 1 credit/request; advanced = 2 credits/request. |
| Extract cost | basic = 1 credit per 5 successful URLs (0.2/URL); advanced = 2 credits per 5 URLs (0.4/URL). Failed extractions not charged. |
| Map / Crawl | Map 1 credit per 10 pages (2 with instructions); crawl = map + extract charges. |
| Research endpoint | mini 4-110 credits, pro 15-250 credits per request. |
| Rate limits | Dev (free) keys: 100 RPM. Production (paid or PAYGO enabled): 1,000 RPM. Crawl 100 RPM; research 20 RPM; usage endpoint 10 req/10 min. 429 with `Retry-After` on excess. |
| Rollover | Not stated in docs. |

Illustrative weekly job: 60 extract URLs basic (12 cr) + 40 searches basic (40 cr) = ~52 credits/week, ~225/month, inside the free tier.

## 4. GitHub Actions scheduling and minutes

| Item | Fact |
|---|---|
| Public repo minutes | "GitHub Actions usage is free for self-hosted runners and for public repositories that use standard GitHub-hosted runners." No minute cap; storage for artifacts/caches is still metered. |
| Private repo included | Free plan 2,000 min + 500 MB artifacts; Pro 3,000 min + 1 GB; Team 3,000 min + 2 GB. Resets monthly. |
| Minimum cron interval | "The shortest interval you can run scheduled workflows is once every 5 minutes." |
| Delays | "The schedule event can be delayed during periods of high loads of GitHub Actions workflow runs. High load times include the start of every hour." |
| Branch | "Scheduled workflows run on the latest commit on the default branch." Cron must exist in the default-branch workflow file. |
| Auto-disable | "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days." Docs do not define "activity" or mention a pre-disable notice. Re-enable via Actions tab -> workflow -> "Enable workflow", or `gh workflow enable WORKFLOW`. |
| Forks | Docs fetched did not state fork behavior. |

## Sources (all checked 2026-10-02)

- OpenRouter models API: https://openrouter.ai/api/v1/models
- OpenRouter rankings: https://openrouter.ai/rankings
- OpenRouter structured outputs: https://openrouter.ai/docs/features/structured-outputs
- OpenRouter usage accounting: https://openrouter.ai/docs/use-cases/usage-accounting
- OpenRouter provisioning keys / limits: https://openrouter.ai/docs/features/provisioning-api-keys
- OpenRouter limits (402, key endpoint): https://openrouter.ai/docs/api-reference/limits
- Tavily pricing: https://www.tavily.com/pricing
- Tavily API credits: https://docs.tavily.com/documentation/api-credits
- Tavily rate limits: https://docs.tavily.com/documentation/rate-limits
- GitHub Actions billing: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions
- GitHub schedule event: https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule
- GitHub disable/enable workflows: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows
