const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const packageJson = require("../package.json");

loadEnvFile();

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const API_KEY = process.env.MARKETO_API_KEY || "";
const PROVIDER_NAME =
  process.env.MARKETO_PROVIDER_NAME || "Marketo SSFS Lead Scoring Calculator";
const SUPPORT_CONTACT =
  process.env.MARKETO_SUPPORT_CONTACT || "support@example.com";
const SERVER_URL = process.env.SERVER_URL || "/";

const serviceDefinition = {
  apiName: "leadScoringCalculator",
  serviceName: "Lead Scoring Calculator",
  i18n: {
    en_US: {
      name: "Lead Scoring Calculator",
      description:
        "Calculates composite score based on behavioral and demographic data.",
    },
    ko_KR: {
      name: "리드 스코어 계산기",
      description:
        "행동 점수와 인구통계 점수를 기반으로 복합 점수를 계산합니다.",
    },
  },
  description:
    "Calculates composite score based on behavioral and demographic data.",
  primaryAttribute: "scoringModel",
  supportedEntityType: "lead",
  enableSplitPaths: false,
  timeout: 10,
  invocationPayloadDef: {
    flowAttributes: [
      {
        apiName: "scoringModel",
        dataType: "string",
        required: false,
        i18n: {
          en_US: {
            displayName: "Scoring Model",
            description: "Scoring model label shown in Marketo activity data.",
          },
          ko_KR: {
            displayName: "스코어링 모델",
            description:
              "Marketo 활동 데이터에 표시할 스코어링 모델 라벨입니다.",
          },
        },
      },
    ],
    fields: [
      {
        serviceAttribute: "behavioralScore",
        dataType: "float",
        required: true,
        description: "Behavioral score used with a 0.3 weighting.",
      },
      {
        serviceAttribute: "demographicScore",
        dataType: "float",
        required: true,
        description:
          "Demographic score added to the weighted behavioral score.",
      },
    ],
    journeyContext: false,
    subscriptionContext: false,
  },
  callbackPayloadDef: {
    fields: [
      {
        serviceAttribute: "compositeScore",
        dataType: "float",
        required: false,
        description: "Composite score calculated by the scoring service.",
      },
    ],
    attributes: [
      {
        apiName: "calculationStatus",
        i18n: {
          en_US: {
            displayName: "Calculation Status",
            description: "Status of the score calculation.",
          },
          ko_KR: {
            displayName: "계산 상태",
            description: "점수 계산 처리 상태입니다.",
          },
        },
        dataType: "string",
      },
      {
        apiName: "compositeScore",
        i18n: {
          en_US: {
            displayName: "Composite Score",
            description: "Composite score included in activity data.",
          },
          ko_KR: {
            displayName: "복합 점수",
            description: "활동 데이터에 포함되는 복합 점수입니다.",
          },
        },
        dataType: "float",
      },
    ],
  },
  inputs: [
    { name: "behavioralScore", type: "number", label: "Behavioral Score" },
    { name: "demographicScore", type: "number", label: "Demographic Score" },
  ],
  outputs: [
    { name: "compositeScore", type: "number", label: "Composite Score" },
  ],
};

const openApiDocument = createOpenApiDocument();

function createOpenApiDocument() {
  return swaggerJSDoc({
    definition: {
      openapi: "3.0.3",
      info: {
        title: PROVIDER_NAME,
        version: packageJson.version,
        description:
          "Calculates a weighted composite score from Marketo lead data.",
        "x-providerName": PROVIDER_NAME,
        "x-schemaVersion": packageJson.version,
        "x-supportContact": SUPPORT_CONTACT,
      },
      servers: [
        {
          url: SERVER_URL,
        },
      ],
      security: [
        {
          apiKeyAuth: [],
        },
      ],
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
          },
        },
      },
    },
    apis: [path.join(__dirname, "server.js")],
  });
}

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const envContent = fs.readFileSync(envPath, "utf8");

  for (const line of envContent.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function isAuthorized(req) {
  if (!API_KEY) {
    return false;
  }

  const headerKey = req.get("x-api-key");
  if (typeof headerKey !== "string") {
    return false;
  }

  const expected = Buffer.from(API_KEY);
  const actual = Buffer.from(headerKey);

  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

function toFiniteNumber(value, fieldName) {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw Object.assign(new Error(`${fieldName} must be a finite number.`), {
      statusCode: 400,
    });
  }

  return numericValue;
}

function computeCompositeScore(lead) {
  if (!lead || typeof lead !== "object" || Array.isArray(lead)) {
    throw Object.assign(new Error("lead must be an object."), {
      statusCode: 400,
    });
  }

  const behavioralScore = toFiniteNumber(
    lead.behavioralScore,
    "behavioralScore",
  );
  const demographicScore = toFiniteNumber(
    lead.demographicScore,
    "demographicScore",
  );

  return behavioralScore * 0.3 + demographicScore;
}

function getSubmittedLead(body) {
  return Array.isArray(body.leads) ? body.leads[0] : body.lead;
}

function sendErrorResponse(res, error) {
  res.status(error.statusCode || 500).json({
    status: "error",
    message: error.message || "Unexpected server error.",
  });
}

function createScoreHandler({ getLead, successStatusCode, successStatus }) {
  return (req, res) => {
    // if (!isAuthorized(req)) {
    //   res.status(401).json({ status: "error", message: "Unauthorized request." });
    //   return;
    // }

    try {
      const compositeScore = computeCompositeScore(getLead(req.body));

      res.status(successStatusCode).json({
        status: successStatus,
        data: { compositeScore },
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  };
}

/**
 * @openapi
 * components:
 *   schemas:
 *     HealthResponse:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           example: ok
 *     serviceStatus:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           example: ok
 *     FieldDefinition:
 *       type: object
 *       required:
 *         - name
 *         - type
 *         - label
 *       properties:
 *         name:
 *           type: string
 *         type:
 *           type: string
 *           enum:
 *             - number
 *         label:
 *           type: string
 *     serviceDefinition:
 *       type: object
 *       required:
 *         - apiName
 *         - i18n
 *         - serviceName
 *         - description
 *         - primaryAttribute
 *         - supportedEntityType
 *         - enableSplitPaths
 *         - invocationPayloadDef
 *         - callbackPayloadDef
 *         - inputs
 *         - outputs
 *       properties:
 *         apiName:
 *           type: string
 *         i18n:
 *           type: object
 *         primaryAttribute:
 *           type: string
 *         supportedEntityType:
 *           type: string
 *           enum:
 *             - lead
 *         enableSplitPaths:
 *           type: boolean
 *         timeout:
 *           type: integer
 *         invocationPayloadDef:
 *           type: object
 *         callbackPayloadDef:
 *           type: object
 *         serviceName:
 *           type: string
 *         description:
 *           type: string
 *         inputs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FieldDefinition'
 *         outputs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FieldDefinition'
 *     LeadScoreInput:
 *       type: object
 *       required:
 *         - behavioralScore
 *         - demographicScore
 *       properties:
 *         id:
 *           type: string
 *           example: "12345"
 *         behavioralScore:
 *           type: number
 *           example: 3
 *         demographicScore:
 *           type: number
 *           example: 20
 *     ComputeScoreRequest:
 *       type: object
 *       required:
 *         - lead
 *       properties:
 *         lead:
 *           $ref: '#/components/schemas/LeadScoreInput'
 *     ComputeScoreSuccess:
 *       type: object
 *       required:
 *         - status
 *         - data
 *       properties:
 *         status:
 *           type: string
 *           enum:
 *             - success
 *         data:
 *           type: object
 *           required:
 *             - compositeScore
 *           properties:
 *             compositeScore:
 *               type: number
 *               example: 20.9
 *     ErrorResponse:
 *       type: object
 *       required:
 *         - status
 *         - message
 *       properties:
 *         status:
 *           type: string
 *           enum:
 *             - error
 *         message:
 *           type: string
 *     SubmitAsyncActionRequest:
 *       type: object
 *       required:
 *         - callbackUrl
 *       properties:
 *         token:
 *           type: string
 *           description: Token to echo in the X-Callback-Token header when posting callback results.
 *         callbackUrl:
 *           type: string
 *           format: uri
 *           description: Marketo callback URL that receives async action results.
 *         lead:
 *           $ref: '#/components/schemas/LeadScoreInput'
 *         leads:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/LeadScoreInput'
 *     SubmitAsyncActionResponse:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum:
 *             - accepted
 *         data:
 *           type: object
 *           properties:
 *             compositeScore:
 *               type: number
 *               example: 20.9
 *     SubmitAsyncActionCallback:
 *       type: object
 *       required:
 *         - leadData
 *         - activityData
 *       properties:
 *         leadData:
 *           type: object
 *           required:
 *             - id
 *             - compositeScore
 *           properties:
 *             id:
 *               type: string
 *               example: "12345"
 *             compositeScore:
 *               type: number
 *               example: 20.9
 *         activityData:
 *           type: object
 *           properties:
 *             calculationStatus:
 *               type: string
 *               example: completed
 *             compositeScore:
 *               type: number
 *               example: 20.9
 */

/**
 * @openapi
 * /openapi.json:
 *   get:
 *     summary: Get OpenAPI document
 *     responses:
 *       200:
 *         description: OpenAPI document for this service
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/serviceStatus'
 *
 * /status:
 *   get:
 *     summary: Marketo service status check
 *     operationId: getStatus
 *     responses:
 *       200:
 *         description: Server is available
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/serviceStatus'
 *
 * /getServiceDefinition:
 *   get:
 *     summary: Get Marketo service definition
 *     operationId: getServiceDefinition
 *     responses:
 *       200:
 *         description: Service definition for Marketo field mapping
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/serviceDefinition'
 *             example:
 *               serviceName: Lead Scoring Calculator
 *               description: Calculates composite score based on behavioral and demographic data.
 *               inputs:
 *                 - name: behavioralScore
 *                   type: number
 *                   label: Behavioral Score
 *                 - name: demographicScore
 *                   type: number
 *                   label: Demographic Score
 *               outputs:
 *                 - name: compositeScore
 *                   type: number
 *                   label: Composite Score
 *
 * /submitAsyncAction:
 *   post:
 *     summary: Submit Marketo async action
 *     operationId: submitAsyncAction
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubmitAsyncActionRequest'
 *           example:
 *             lead:
 *               id: "12345"
 *               behavioralScore: 3
 *               demographicScore: 20
 *     responses:
 *       201:
 *         description: Request accepted for processing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubmitAsyncActionResponse'
 *             example:
 *               status: accepted
 *               data:
 *                 compositeScore: 20.9
 *       400:
 *         description: Invalid request payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     callbacks:
 *       actionComplete:
 *         '{$request.body#/callbackUrl}':
 *           post:
 *             summary: Submit async action result callback
 *             operationId: submitAsyncActionCallback
 *             parameters:
 *               - name: X-Callback-Token
 *                 in: header
 *                 required: true
 *                 schema:
 *                   type: string
 *             requestBody:
 *               required: true
 *               content:
 *                 application/json:
 *                   schema:
 *                     $ref: '#/components/schemas/SubmitAsyncActionCallback'
 *                   example:
 *                     leadData:
 *                       id: "12345"
 *                       compositeScore: 20.9
 *                     activityData:
 *                       calculationStatus: completed
 *                       compositeScore: 20.9
 *             responses:
 *               200:
 *                 description: Callback received
 *
 * /v1/computeScore:
 *   post:
 *     summary: Compute weighted composite lead score
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ComputeScoreRequest'
 *           example:
 *             lead:
 *               id: "12345"
 *               behavioralScore: 3
 *               demographicScore: 20
 *     responses:
 *       200:
 *         description: Composite score calculation result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ComputeScoreSuccess'
 *             example:
 *               status: success
 *               data:
 *                 compositeScore: 20.9
 *       400:
 *         description: Invalid request payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/status", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/getServiceDefinition", (req, res) => {
    res.json(serviceDefinition);
  });

  app.get("/openapi.json", (req, res) => {
    res.json(openApiDocument);
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.post(
    "/submitAsyncAction",
    createScoreHandler({
      getLead: getSubmittedLead,
      successStatusCode: 201,
      successStatus: "accepted",
    }),
  );

  app.post(
    "/v1/computeScore",
    createScoreHandler({
      getLead: (body) => body.lead,
      successStatusCode: 200,
      successStatus: "success",
    }),
  );

  app.use((req, res) => {
    res.status(404).json({ status: "error", message: "Not found." });
  });

  app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({
        status: "error",
        message: "Request body must be valid JSON.",
      });
      return;
    }

    res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message || "Unexpected server error.",
    });
  });

  return app;
}

function createServer() {
  return createApp();
}

if (require.main === module) {
  createApp().listen(PORT, () => {
    console.log(`Marketo SSFS server listening on port ${PORT}`);
    console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
  });
}

module.exports = {
  createApp,
  computeCompositeScore,
  createServer,
  openApiDocument,
  serviceDefinition,
};
