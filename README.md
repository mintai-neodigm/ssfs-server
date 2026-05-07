# Marketo SSFS Server

Marketo SSFS Weighted Composite Lead Scoring 테스트를 위한 Node.js 기반 백엔드 서버입니다.

## 엔드포인트

- `GET /status`
- `GET /getServiceDefinition`
- `GET /openapi.json`
- `GET /api-docs`
- `POST /submitAsyncAction`
- `POST /v1/computeScore`

## 계산식

```text
Composite Score = (Behavioral Score * 0.3) + Demographic Score
```

## 로컬 실행

```powershell
$env:MARKETO_API_KEY="local-test-key"
$env:SERVER_URL="http://localhost:3000"
npm run dev
```

디버그 로그가 필요하면 아래 환경변수를 추가합니다.

```powershell
$env:DEBUG_SSFS="true"
npm test
```

## 점수 계산 요청

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/v1/computeScore" `
  -Headers @{ "x-api-key" = "local-test-key" } `
  -ContentType "application/json" `
  -Body '{ "lead": { "id": "12345", "behavioralScore": 3, "demographicScore": 20 } }'
```

예상 응답:

```json
{
  "status": "success",
  "data": {
    "compositeScore": 20.9
  }
}
```

## Marketo Async Action 흐름

`POST /submitAsyncAction`은 Marketo SSFS용 비동기 실행 엔드포인트입니다.

1. Marketo가 `callbackUrl`, `token`, lead 데이터를 함께 전송합니다.
2. 서버는 요청을 접수하면 즉시 `201 Accepted`를 반환합니다.
3. 서버는 점수를 계산한 뒤 `callbackUrl`로 결과를 `POST`합니다.
4. callback 요청에는 `X-Callback-Token` 헤더로 Marketo가 보낸 token을 다시 전달합니다.

callback payload 예시:

```json
{
  "objectData": [
    {
      "leadData": {
        "id": "12345",
        "compositeScore": 20.9
      },
      "activityData": {
        "success": true,
        "errorCode": null,
        "reason": null,
        "calculationStatus": "completed",
        "scoringModel": "weighted-composite-v1",
        "compositeScore": 20.9
      }
    }
  ]
}
```

## Render 배포

1. 이 저장소로 Render Web Service를 생성합니다.
2. `render.yaml`을 사용하거나, 아래 값을 직접 설정합니다.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variable: `MARKETO_API_KEY`
   - Environment Variable: `SERVER_URL`
   - Environment Variable: `MARKETO_PROVIDER_NAME`
   - Environment Variable: `MARKETO_SUPPORT_CONTACT`
3. Marketo Admin 설정에도 같은 API Key를 입력하고, 요청 시 `x-api-key` 헤더로 전달되도록 설정합니다.

## Marketo SSFS Best Practices

아래 내용은 이 서비스를 Marketo SSFS에 설치하면서 실제로 마주친 검증 오류를 바탕으로 정리한 Best Practices입니다.

### OpenAPI 문서

- `GET /openapi.json`은 Marketo 설치 과정에서 접근 가능해야 하므로 공개 HTTPS URL로 열려 있어야 합니다.
- `info`에는 아래 필드가 필요합니다.
  - `x-providerName`
  - `x-schemaVersion`
  - `x-supportContact`
- `x-schemaVersion`은 `package.json`의 `version`과 일치시키는 것이 좋습니다.
- `servers`를 명시하세요. Render 또는 ngrok을 사용할 경우 `SERVER_URL`을 공개 base URL로 설정합니다.
- 필수 경로는 아래와 같습니다.
  - `/getServiceDefinition`
  - `/submitAsyncAction`
  - `/status`
- Marketo는 일부 schema `$ref` 값을 엄격하게 검사합니다.
  - `/status` 응답 schema는 `#/components/schemas/serviceStatus`를 참조해야 합니다.
  - `/getServiceDefinition` 응답 schema는 `#/components/schemas/serviceDefinition`을 참조해야 합니다.
- `/submitAsyncAction`에는 OpenAPI `callbacks` 객체가 필요합니다. 요청의 `callbackUrl`을 runtime expression으로 사용합니다.

```yaml
callbacks:
  actionComplete:
    "{$request.body#/callbackUrl}":
      post:
        summary: Submit async action result callback
```

### Service Definition

`GET /getServiceDefinition`은 단순한 `inputs`/`outputs` 목록이 아니라 Marketo의 Service Definition 형식으로 응답해야 합니다. 최소한 아래 필드를 포함하세요.

- `apiName`
- `i18n`
- `primaryAttribute`
- `supportedEntityType`
- `enableSplitPaths`
- `invocationPayloadDef`
- `callbackPayloadDef`

`lead` 서비스라면, Marketo에서 서비스로 전달할 필드는 `invocationPayloadDef.fields`에 정의하고, 서비스에서 Marketo로 돌려줄 필드는 `callbackPayloadDef.fields`에 정의합니다.

### Attribute 이름 규칙

- `callbackPayloadDef.attributes`에서는 예약어이거나 애매한 `apiName`을 피하세요.
- `success`는 Marketo 예약어이므로 attribute `apiName`으로 사용하면 안 됩니다.
- 대신 `calculationStatus`처럼 도메인 의미가 분명한 이름을 사용하세요.
- Attribute 항목에는 `apiName`, `dataType`, `i18n`이 필요합니다.

### 인증

- OpenAPI에 API Key 인증을 선언하면, Marketo 설치 화면에서 API Key 입력이 필요합니다.
- 긴 랜덤 키를 생성한 뒤 Marketo와 서버에 같은 값을 설정하세요.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

서버에는 아래처럼 설정합니다.

```text
MARKETO_API_KEY=generated-key
```

### ngrok으로 공개 테스트

ngrok은 현재 검증된 계정과 authtoken이 필요합니다. 먼저 아래처럼 설정합니다.

```powershell
npx -y ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
npx -y ngrok http 3001
```

서버를 시작하기 전에 `SERVER_URL`을 ngrok 공개 URL로 설정합니다.

```powershell
$env:SERVER_URL="https://your-ngrok-url.ngrok-free.app"
npm run dev
```

Marketo 설치 화면에는 아래 URL을 입력합니다.

```text
https://your-ngrok-url.ngrok-free.app/openapi.json
```

### 검증

Marketo 설치를 다시 시도하기 전에 테스트를 실행하세요.

```powershell
npm test
```

테스트는 필수 OpenAPI 필드, Marketo가 엄격하게 검사하는 schema 참조, Service Definition 필드, `/status`, `/submitAsyncAction`을 검증합니다.
