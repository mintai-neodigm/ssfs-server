# Marketo SSFS Server

Node.js based backend server for testing Marketo SSFS weighted composite lead scoring.

## Endpoints

- `GET /health`
- `GET /status`
- `GET /getServiceDefinition`
- `GET /openapi.json`
- `GET /api-docs`
- `POST /submitAsyncAction`
- `POST /v1/computeScore`

## Formula

```text
Composite Score = (Behavioral Score * 0.3) + Demographic Score
```

## Local Run

```powershell
$env:MARKETO_API_KEY="local-test-key"
$env:SERVER_URL="http://localhost:3000"
npm run dev
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
   - Environment Variable: `SERVER_URL`
   - Environment Variable: `MARKETO_PROVIDER_NAME`
   - Environment Variable: `MARKETO_SUPPORT_CONTACT`
3. Configure the same API key in Marketo Admin and send it as the `x-api-key` header.

## Marketo SSFS Best Practices

These notes are based on the validation errors encountered while installing this service in Marketo SSFS.

### OpenAPI document

- `GET /openapi.json` must be publicly reachable over HTTPS for Marketo installation.
- `info` must include:
  - `x-providerName`
  - `x-schemaVersion`
  - `x-supportContact`
- `x-schemaVersion` should match `package.json` `version`.
- Define `servers` explicitly. For Render or ngrok, set `SERVER_URL` to the public base URL.
- Required paths must exist:
  - `/getServiceDefinition`
  - `/submitAsyncAction`
  - `/status`
- Marketo validates some schema `$ref` values strictly:
  - `/status` response schema should reference `#/components/schemas/serviceStatus`
  - `/getServiceDefinition` response schema should reference `#/components/schemas/serviceDefinition`
- `/submitAsyncAction` must include an OpenAPI `callbacks` object. Use the request `callbackUrl` as the runtime expression:

```yaml
callbacks:
  actionComplete:
    "{$request.body#/callbackUrl}":
      post:
        summary: Submit async action result callback
```

### Service definition

`GET /getServiceDefinition` must return Marketo's Service Definition shape, not only a simple inputs/outputs list. Include at least:

- `apiName`
- `i18n`
- `primaryAttribute`
- `supportedEntityType`
- `enableSplitPaths`
- `invocationPayloadDef`
- `callbackPayloadDef`

For `lead` services, declare `invocationPayloadDef.fields` for outgoing mapped fields and `callbackPayloadDef.fields` for incoming mapped fields.

### Attribute naming

- Avoid reserved or ambiguous `apiName` values in `callbackPayloadDef.attributes`.
- `success` is reserved by Marketo and should not be used as an attribute `apiName`.
- Use a domain-specific name such as `calculationStatus`.
- Attribute entries require `apiName`, `dataType`, and `i18n`.

### Authentication

- If OpenAPI declares API key authentication, Marketo installation requires an API key.
- Generate a long random key and set the same value in both Marketo and the server:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set it as:

```text
MARKETO_API_KEY=generated-key
```

### Public testing with ngrok

ngrok now requires a verified account and authtoken. Configure it first:

```powershell
npx -y ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
npx -y ngrok http 3001
```

Then set `SERVER_URL` to the public ngrok URL before starting the server:

```powershell
$env:SERVER_URL="https://your-ngrok-url.ngrok-free.app"
npm run dev
```

Use this installation URL in Marketo:

```text
https://your-ngrok-url.ngrok-free.app/openapi.json
```

### Verification

Run tests before trying Marketo installation again:

```powershell
npm test
```

The tests verify the required OpenAPI fields, strict Marketo schema references, service definition fields, `/status`, and `/submitAsyncAction`.
