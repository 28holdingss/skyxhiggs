# ChatGPT Custom GPT (Actions)

Sky × Higgs exposes authenticated Action routes so a Custom GPT can generate through your deployed app. Higgsfield keys stay on the server.

## 1. Env

In `.env.local` (and on your host):

```bash
ACTIONS_API_KEY=generate-a-long-random-secret
```

Keep `HF_API_KEY_ID` / `HF_API_KEY_SECRET` as usual. Restart the server after changes.

## 2. Deploy

ChatGPT Actions need a public **HTTPS** origin (Vercel, Railway, etc.). Localhost is not enough for a real GPT.

Production host: **https://skyxhiggs.vercel.app**

After deploy, confirm:

- `GET https://skyxhiggs.vercel.app/openapi/chatgpt-actions.yaml`
- `GET https://skyxhiggs.vercel.app/api/actions/models` with `Authorization: Bearer YOUR_ACTIONS_API_KEY`

Set `ACTIONS_API_KEY` (and the Higgsfield keys) in the Vercel project env, then redeploy.

## 3. Create the GPT

1. ChatGPT → **Explore GPTs** → **Create** → **Configure**
2. Name: `Sky × Higgs`
3. **Instructions**: paste [`instructions.md`](./instructions.md)
4. **Actions** → **Create new action**
5. **Import from URL**: `https://skyxhiggs.vercel.app/openapi/chatgpt-actions.yaml`  
   Or paste the YAML from `public/openapi/chatgpt-actions.yaml` (server URL is already set).
6. **Authentication** → **API Key**  
   - Auth Type: **Bearer**  
   - API Key: the same `ACTIONS_API_KEY`
7. Save and test with: “List available models” then a short Soul v2 image prompt.

## 4. Expected chat flow

1. User asks for a clip or still.
2. GPT may call `listModels`, then `registerImage` if there is a photo URL.
3. GPT calls `generate` **once**.
4. GPT polls `listJobs` until terminal.
5. GPT returns `outputUrl`.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/actions/models` | Model catalog |
| POST | `/api/actions/register-image` | `{ imageUrl }` → Higgsfield `publicUrl` |
| POST | `/api/actions/generate` | Start job (do not retry) |
| GET | `/api/actions/jobs` | Poll status |
| POST | `/api/actions/jobs/{id}/cancel` | Cancel while queued |

The web studio at `/` keeps using `/api/generate` and `/api/jobs` without the Actions key.
