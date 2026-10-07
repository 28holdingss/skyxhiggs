# Sky × Higgs

Next.js studio that proxies the [Higgsfield API](https://docs.higgsfield.ai/docs). Credentials stay server-side.

## Getting Started

```bash
cp .env.example .env.local
# add HF_API_KEY_ID and HF_API_KEY_SECRET from console.higgsfield.ai

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use Node.js 20+.

## ChatGPT Custom GPT

Authenticated Action routes live under `/api/actions/*`. Setup guide: [`chatgpt/README.md`](./chatgpt/README.md).

OpenAPI schema: `/openapi/chatgpt-actions.yaml` (set `ACTIONS_API_KEY` before enabling Actions).
