const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

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

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(
          Object.assign(new Error("Request body is too large."), {
            statusCode: 413,
          }),
        );
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        reject(
          Object.assign(new Error("Request body is required."), {
            statusCode: 400,
          }),
        );
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(
          Object.assign(new Error("Request body must be valid JSON."), {
            statusCode: 400,
          }),
        );
      }
    });
    req.on("error", reject);
  });
}

function isAuthorized(req) {
  if (!API_KEY) {
    return false;
  }

  const headerKey = req.headers["x-api-key"];
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

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/getServiceDefinition") {
    sendJson(res, 200, serviceDefinition);
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/computeScore") {
    // if (!isAuthorized(req)) {
    //   sendJson(res, 401, { status: "error", message: "Unauthorized request." });
    //   return;
    // }

    try {
      const payload = await parseJsonBody(req);
      const compositeScore = computeCompositeScore(payload.lead);

      sendJson(res, 200, {
        status: "success",
        data: { compositeScore },
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        status: "error",
        message: error.message || "Unexpected server error.",
      });
    }
    return;
  }

  sendJson(res, 404, { status: "error", message: "Not found." });
}

function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      sendJson(res, 500, {
        status: "error",
        message: error.message || "Unexpected server error.",
      });
    });
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Marketo SSFS server listening on port ${PORT}`);
  });
}

module.exports = {
  computeCompositeScore,
  createServer,
  serviceDefinition,
};
