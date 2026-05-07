const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const packageJson = require("../package.json");

const {
  createApp,
  computeCompositeScore,
  openApiDocument,
  serviceDefinition,
} = require("../src/server");

const expectedServerUrl = process.env.SERVER_URL || "/";
const expectedEnvMunchkinId = process.env.MARKETO_MUNCHKIN_ID || "";
const expectedProviderName =
  process.env.MARKETO_PROVIDER_NAME || "Marketo SSFS Lead Scoring Calculator";
const expectedSupportContact =
  process.env.MARKETO_SUPPORT_CONTACT || "support@example.com";

async function withTestServer(t) {
  const server = createApp().listen(0);

  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  }));

  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

async function withCallbackServer(t) {
  let resolveCallback;
  let rejectCallback;
  const callback = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = http.createServer((req, res) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        resolveCallback({
          headers: req.headers,
          method: req.method,
          payload,
          url: req.url,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "received" }));
      } catch (error) {
        rejectCallback(error);
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "error" }));
      }
    });
  });

  server.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  }));

  const { port } = server.address();
  return {
    callback,
    callbackUrl: `http://127.0.0.1:${port}/callback`,
  };
}

test("service definition exposes expected inputs and outputs", () => {
  assert.equal(serviceDefinition.apiName, "leadScoringCalculator");
  assert.equal(serviceDefinition.serviceName, "Lead Scoring Calculator");
  assert.equal(serviceDefinition.i18n.en_US.name, "Lead Scoring Calculator");
  assert.equal(serviceDefinition.i18n.ko_KR.name, "리드 스코어 계산기");
  assert.equal(serviceDefinition.primaryAttribute, "scoringModel");
  assert.equal(serviceDefinition.supportedEntityType, "lead");
  assert.equal(serviceDefinition.enableSplitPaths, false);
  assert.ok(serviceDefinition.invocationPayloadDef);
  assert.ok(serviceDefinition.callbackPayloadDef);
  assert.deepEqual(
    serviceDefinition.invocationPayloadDef.fields.map((field) => field.serviceAttribute),
    ["behavioralScore", "demographicScore"],
  );
  assert.deepEqual(
    serviceDefinition.callbackPayloadDef.fields.map((field) => field.serviceAttribute),
    ["compositeScore"],
  );
  assert.deepEqual(
    serviceDefinition.callbackPayloadDef.attributes.map((attribute) => attribute.apiName),
    ["calculationStatus", "compositeScore"],
  );
  assert.equal(
    serviceDefinition.callbackPayloadDef.attributes[0].i18n.ko_KR.displayName,
    "계산 상태",
  );
  assert.equal(
    serviceDefinition.invocationPayloadDef.flowAttributes[0].i18n.ko_KR.displayName,
    "스코어링 모델",
  );
  assert.deepEqual(
    serviceDefinition.inputs.map((input) => input.name),
    ["behavioralScore", "demographicScore"]
  );
  assert.deepEqual(
    serviceDefinition.outputs.map((output) => output.name),
    ["compositeScore"]
  );
});

test("openapi document exposes compute score endpoint", () => {
  assert.equal(openApiDocument.openapi, "3.0.3");
  assert.equal(
    openApiDocument.info["x-providerName"],
    expectedProviderName,
  );
  assert.equal(openApiDocument.info["x-schemaVersion"], packageJson.version);
  assert.equal(openApiDocument.info["x-supportContact"], expectedSupportContact);
  assert.deepEqual(openApiDocument.servers, [{ url: expectedServerUrl }]);
  assert.ok(openApiDocument.paths["/openapi.json"].get);
  assert.ok(openApiDocument.paths["/status"].get);
  assert.equal(
    openApiDocument.paths["/status"].get.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/serviceStatus",
  );
  assert.equal(
    openApiDocument.paths["/getServiceDefinition"].get.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/serviceDefinition",
  );
  assert.ok(openApiDocument.paths["/submitAsyncAction"].post);
  assert.ok(openApiDocument.paths["/submitAsyncAction"].post.callbacks);
  assert.ok(
    openApiDocument.paths["/submitAsyncAction"].post.callbacks.actionComplete[
      "{$request.body#/callbackUrl}"
    ].post,
  );
  assert.ok(openApiDocument.paths["/v1/computeScore"].post);
  assert.equal(
    openApiDocument.components.securitySchemes.apiKeyAuth.name,
    "x-api-key",
  );
});

test("computes weighted composite score", () => {
  const score = computeCompositeScore({
    behavioralScore: 3,
    demographicScore: 20
  });

  assert.equal(score, 20.9);
});

test("accepts numeric strings from form-like integrations", () => {
  const score = computeCompositeScore({
    behavioralScore: "10.5",
    demographicScore: "2"
  });

  assert.equal(score, 5.15);
});

test("rejects non-finite score values", () => {
  assert.throws(
    () => computeCompositeScore({ behavioralScore: "abc", demographicScore: 20 }),
    /behavioralScore must be a finite number/
  );
});

test("serves Marketo-required OpenAPI info fields over http", async (t) => {
  const baseUrl = await withTestServer(t);
  const response = await fetch(`${baseUrl}/openapi.json`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.info["x-providerName"], expectedProviderName);
  assert.equal(body.info["x-schemaVersion"], packageJson.version);
  assert.equal(body.info["x-supportContact"], expectedSupportContact);
  assert.deepEqual(body.servers, [{ url: expectedServerUrl }]);
});

test("serves Marketo-required service definition fields over http", async (t) => {
  const baseUrl = await withTestServer(t);
  const response = await fetch(`${baseUrl}/getServiceDefinition`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.apiName, "leadScoringCalculator");
  assert.equal(body.i18n.en_US.name, "Lead Scoring Calculator");
  assert.equal(body.i18n.ko_KR.name, "리드 스코어 계산기");
  assert.equal(body.primaryAttribute, "scoringModel");
  assert.equal(body.supportedEntityType, "lead");
  assert.equal(body.enableSplitPaths, false);
  assert.ok(body.invocationPayloadDef);
  assert.ok(body.callbackPayloadDef);
});

test("serves Marketo-required status endpoint over http", async (t) => {
  const baseUrl = await withTestServer(t);
  const response = await fetch(`${baseUrl}/status`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: "ok" });
});

test("accepts Marketo submitAsyncAction requests over http", async (t) => {
  const baseUrl = await withTestServer(t);
  const { callback, callbackUrl } = await withCallbackServer(t);
  const response = await fetch(`${baseUrl}/submitAsyncAction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      munchkinId: "123-ABC-456",
      callbackUrl,
      token: "test-callback-token",
      flowStepContext: {
        scoringModel: "weighted-composite-v1",
      },
      lead: {
        id: "12345",
        behavioralScore: 3,
        demographicScore: 20,
      },
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(body, {
    status: "accepted",
  });

  const callbackRequest = await callback;
  assert.equal(callbackRequest.method, "POST");
  assert.equal(callbackRequest.url, "/callback");
  assert.equal(callbackRequest.headers["x-callback-token"], "test-callback-token");
  assert.ok(callbackRequest.headers["x-request-id"]);
  assert.deepEqual(callbackRequest.payload, {
    munchkinId: expectedEnvMunchkinId || "123-ABC-456",
    objectData: [
      {
        leadData: {
          id: 12345,
          compositeScore: 20.9,
        },
        activityData: {
          success: true,
          errorCode: null,
          reason: null,
          calculationStatus: "completed",
          scoringModel: "weighted-composite-v1",
          compositeScore: 20.9,
        },
      },
    ],
  });
});

test("accepts Marketo leadContext payloads over http", async (t) => {
  const baseUrl = await withTestServer(t);
  const { callback, callbackUrl } = await withCallbackServer(t);
  const response = await fetch(`${baseUrl}/submitAsyncAction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      callbackUrl,
      token: "test-callback-token",
      flowStepContext: {
        attributes: {
          scoringModel: "lead-context-model",
        },
      },
      leadContext: {
        id: "abc-123",
        fields: {
          behavioralScore: 6,
          demographicScore: 10,
        },
      },
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(body, {
    status: "accepted",
  });

  const callbackRequest = await callback;
  assert.deepEqual(callbackRequest.payload, {
    munchkinId: expectedEnvMunchkinId,
    objectData: [
      {
        leadData: {
          id: "abc-123",
          compositeScore: 11.8,
        },
        activityData: {
          success: true,
          errorCode: null,
          reason: null,
          calculationStatus: "completed",
          scoringModel: "lead-context-model",
          compositeScore: 11.8,
        },
      },
    ],
  });
});

test("accepts Marketo objectData payloads over http", async (t) => {
  const baseUrl = await withTestServer(t);
  const { callback, callbackUrl } = await withCallbackServer(t);
  const response = await fetch(`${baseUrl}/submitAsyncAction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      token: "object-data-token",
      munchkinId: "734-MIC-484",
      apiCallBackKey: "object-data-key",
      campaignId: 3170,
      callbackUrl,
      context: {
        admin: {},
      },
      objectData: [
        {
          objectType: "lead",
          objectContext: {
            behavioralScore: 4,
            demographicScore: 12,
            id: 151635,
          },
          flowStepContext: {
            scoringModel: "object-data-model",
          },
        },
      ],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(body, {
    status: "accepted",
  });

  const callbackRequest = await callback;
  assert.equal(callbackRequest.headers["x-callback-token"], "object-data-token");
  assert.equal(callbackRequest.headers["x-api-key"], "object-data-key");
  assert.ok(callbackRequest.headers["x-request-id"]);
  assert.deepEqual(callbackRequest.payload, {
    munchkinId: expectedEnvMunchkinId || "734-MIC-484",
    objectData: [
      {
        leadData: {
          id: 151635,
          compositeScore: 13.2,
        },
        activityData: {
          success: true,
          errorCode: null,
          reason: null,
          calculationStatus: "completed",
          scoringModel: "object-data-model",
          compositeScore: 13.2,
        },
      },
    ],
  });
});

test("extracts munchkinId from Marketo callback token", async (t) => {
  const baseUrl = await withTestServer(t);
  const { callback, callbackUrl } = await withCallbackServer(t);
  const token = Buffer.from("734-MIC-484-test-token").toString("base64");
  const response = await fetch(`${baseUrl}/submitAsyncAction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      token,
      apiCallBackKey: "object-data-key",
      campaignId: 3170,
      callbackUrl,
      context: {
        admin: {},
      },
      objectData: [
        {
          objectType: "lead",
          objectContext: {
            behavioralScore: 4,
            demographicScore: 12,
            id: 151635,
          },
          flowStepContext: {},
        },
      ],
    }),
  });

  assert.equal(response.status, 201);

  const callbackRequest = await callback;
  assert.equal(callbackRequest.payload.munchkinId, expectedEnvMunchkinId || "734-MIC-484");
});
