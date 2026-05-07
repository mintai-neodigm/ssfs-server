const assert = require("node:assert/strict");
const test = require("node:test");
const packageJson = require("../package.json");

const {
  createApp,
  computeCompositeScore,
  openApiDocument,
  serviceDefinition,
} = require("../src/server");

const expectedServerUrl = process.env.SERVER_URL || "/";

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
    ["success", "compositeScore"],
  );
  assert.equal(
    serviceDefinition.callbackPayloadDef.attributes[0].i18n.ko_KR.displayName,
    "성공 여부",
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
    openApiDocument["x-providerName"],
    "Marketo SSFS Lead Scoring Calculator",
  );
  assert.equal(
    openApiDocument.info["x-providerName"],
    "Marketo SSFS Lead Scoring Calculator",
  );
  assert.equal(openApiDocument.info["x-schemaVersion"], packageJson.version);
  assert.equal(openApiDocument.info["x-supportContact"], "support@example.com");
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
  assert.equal(body.info["x-providerName"], "Marketo SSFS Lead Scoring Calculator");
  assert.equal(body.info["x-schemaVersion"], packageJson.version);
  assert.equal(body.info["x-supportContact"], "support@example.com");
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
  const response = await fetch(`${baseUrl}/submitAsyncAction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
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
    data: {
      compositeScore: 20.9,
    },
  });
});
