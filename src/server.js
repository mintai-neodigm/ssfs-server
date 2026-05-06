const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

loadEnvFile();

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const API_KEY = process.env.MARKETO_API_KEY || "";

const serviceDefinition = {
  serviceName: "Lead Scoring Calculator",
  description:
    "Calculates composite score based on behavioral and demographic data.",
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
        title: "Marketo SSFS Lead Scoring Calculator",
        version: "1.0.0",
        description:
          "Calculates a weighted composite score from Marketo lead data.",
        "x-providerName": "Marketo SSFS Lead Scoring Calculator",
      },
      "x-providerName": "Marketo SSFS Lead Scoring Calculator",
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
 *     ServiceDefinition:
 *       type: object
 *       required:
 *         - serviceName
 *         - description
 *         - inputs
 *         - outputs
 *       properties:
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
 *     ComputeScoreRequest:
 *       type: object
 *       required:
 *         - lead
 *       properties:
 *         lead:
 *           type: object
 *           required:
 *             - behavioralScore
 *             - demographicScore
 *           properties:
 *             id:
 *               type: string
 *               example: "12345"
 *             behavioralScore:
 *               type: number
 *               example: 3
 *             demographicScore:
 *               type: number
 *               example: 20
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
 *               $ref: '#/components/schemas/HealthResponse'
 *
 * /getServiceDefinition:
 *   get:
 *     summary: Get Marketo service definition
 *     responses:
 *       200:
 *         description: Service definition for Marketo field mapping
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServiceDefinition'
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

  app.get("/getServiceDefinition", (req, res) => {
    res.json(serviceDefinition);
  });

  app.get("/openapi.json", (req, res) => {
    res.json(openApiDocument);
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.post("/v1/computeScore", (req, res) => {
    // if (!isAuthorized(req)) {
    //   res.status(401).json({ status: "error", message: "Unauthorized request." });
    //   return;
    // }

    try {
      const compositeScore = computeCompositeScore(req.body.lead);

      res.json({
        status: "success",
        data: { compositeScore },
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: "error",
        message: error.message || "Unexpected server error.",
      });
    }
  });

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
