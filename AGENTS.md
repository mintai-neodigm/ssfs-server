# AI Agent Instructions for Marketo SSFS Server

## Project Overview

This is a Node.js Express backend that implements **weighted composite lead scoring** for Marketo SSFS (Secure Streaming Feed Service). It calculates a composite score from behavioral and demographic data using the formula:

```
Composite Score = (Behavioral Score × 0.3) + Demographic Score
```

## Quick Start

| Command | Purpose |
|---------|---------|
| `npm start` | Start production server (uses environment variables) |
| `npm run dev` | Start with auto-reload (requires nodemon, uses .env file) |
| `npm test` | Run test suite with Node's native test module |

**Required Environment:**
- Node.js ≥ 20
- `MARKETO_API_KEY` environment variable (for API authentication)

## Project Structure

- **`src/server.js`** - Main Express application with all endpoints and business logic
  - Request validation and error handling
  - OpenAPI/Swagger documentation generation
  - API key authentication (timing-safe comparison)
  - Service definition and score computation
- **`test/server.test.js`** - Test suite using Node's native test module
  - Service definition validation
  - OpenAPI document structure checks
  - Score computation edge cases (numeric strings, invalid values)
  - HTTP endpoint testing
- **`render.yaml`** - Render deployment configuration
- **`.env`** - Local development environment file (custom loader in server.js)

## API Endpoints

All endpoints except `/health` and `/openapi.json` require `x-api-key` header authentication.

| Endpoint | Method | Purpose | Notes |
|----------|--------|---------|-------|
| `/health` | GET | Health check | No auth required |
| `/status` | GET | Service status | Returns `serviceStatus` schema |
| `/getServiceDefinition` | GET | Service inputs/outputs definition | Required by Marketo |
| `/v1/computeScore` | POST | Calculate composite score | JSON body with `lead` object |
| `/openapi.json` | GET | OpenAPI specification | No auth required |
| `/api-docs` | GET | Swagger UI | No auth required |

### POST `/v1/computeScore` Request Body

```json
{
  "lead": {
    "id": "12345",
    "behavioralScore": 3,
    "demographicScore": 20
  }
}
```

Response (success):
```json
{
  "status": "success",
  "data": {
    "compositeScore": 20.9
  }
}
```

## Key Implementation Details

### Scoring Formula
- Accepts numeric values or numeric strings
- Validates finite numbers (rejects NaN, Infinity, non-numeric strings)
- Composite Score = (Behavioral × 0.3) + Demographic

### Security
- API key authentication via `x-api-key` header (timing-safe comparison with `crypto.timingSafeEqual`)
- Returns 401 for missing or invalid keys

### Configuration
- Port: `process.env.PORT` or 3000
- API Key: `process.env.MARKETO_API_KEY`
- Provider Name: `process.env.MARKETO_PROVIDER_NAME` (default: "Marketo SSFS Lead Scoring Calculator")
- Support Contact: `process.env.MARKETO_SUPPORT_CONTACT` (default: "support@example.com")
- Server URL: `process.env.SERVER_URL` (default: "/")

### Testing Notes
- Uses Node's built-in `test` module (no external test framework)
- Tests use `assert/strict` for assertions
- Uses dynamic port allocation for test servers
- Test server cleanup is guaranteed via `t.after()`

## Dependencies

| Package | Purpose |
|---------|---------|
| express | Web framework |
| swagger-jsdoc | OpenAPI doc generation from JSDoc comments |
| swagger-ui-express | Interactive API documentation UI |
| nodemon | Dev-only auto-reload |

## Common Tasks

### Adding a New Endpoint
1. Define route handler in `src/server.js`
2. Add JSDoc with `@swagger` tag for OpenAPI documentation
3. Ensure authentication is validated via `isAuthorized(req)`
4. Add corresponding test in `test/server.test.js`
5. Update service definition if inputs/outputs change

### Modifying Scoring Formula
1. Update `computeCompositeScore()` function in `src/server.js`
2. Update the `serviceDefinition` inputs/outputs if parameters change
3. Update `README.md` formula documentation
4. Add/update tests in `test/server.test.js`
5. Remember: values can be strings and must validate as finite numbers

### Local Development with .env
1. Create `.env` file in project root
2. Set variables: `MARKETO_API_KEY=local-test-key`
3. Run `npm run dev` (loads from .env via custom loader)

### Deployment to Render
1. Commits to this repo trigger automatic deployment
2. `render.yaml` configures Node 20, build command, and start command
3. Must set `MARKETO_API_KEY`, `MARKETO_SUPPORT_CONTACT`, and `SERVER_URL` in Render dashboard

## Error Handling

Errors include a `statusCode` property:
- **400**: Invalid request (non-finite numbers, missing fields, malformed lead object)
- **401**: Missing or invalid API key
- **500**: Server errors

## Related Documentation

- See [README.md](README.md) for quick-start examples and curl/PowerShell commands
- See [render.yaml](render.yaml) for deployment environment setup
- OpenAPI spec available at `/openapi.json` and `/api-docs` (Swagger UI)
