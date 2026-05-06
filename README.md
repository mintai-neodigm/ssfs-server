# Marketo SSFS Server

Node.js based backend server for testing Marketo SSFS weighted composite lead scoring.

## Endpoints

- `GET /health`
- `GET /getServiceDefinition`
- `POST /v1/computeScore`

## Formula

```text
Composite Score = (Behavioral Score * 0.3) + Demographic Score
```

## Local Run

```powershell
$env:MARKETO_API_KEY="local-test-key"
npm start
```

## Compute Request

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/v1/computeScore" `
  -Headers @{ "x-api-key" = "local-test-key" } `
  -ContentType "application/json" `
  -Body '{ "lead": { "id": "12345", "behavioralScore": 3, "demographicScore": 20 } }'
```

Expected response:

```json
{
  "status": "success",
  "data": {
    "compositeScore": 20.9
  }
}
```

## Render Deployment

1. Create a Render Web Service from this repository.
2. Use `render.yaml`, or set the following manually:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variable: `MARKETO_API_KEY`
3. Configure the same API key in Marketo Admin and send it as the `x-api-key` header.
