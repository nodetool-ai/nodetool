import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
process.env.FAL_API_KEY = 'packed-fal-fixture-sentinel';
let step = 0;
const origin = 'https://queue.fal.run/openrouter/router';
const routes = [origin, `${origin}/requests/packed-fixture/status`, `${origin}/requests/packed-fixture`];
const responses = [{request_id:'packed-fixture'}, {status:'COMPLETED'}, {output:'packed FAL fixture', partial:false}];
globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const method = init.method ?? (input instanceof Request ? input.method : 'GET');
  assert.equal(url, routes[step], `Unexpected fixture fetch: ${method} ${url}`);
  assert.equal(method, step === 0 ? 'POST' : 'GET');
  assert.equal(new Headers(init.headers).get('authorization'), 'Key packed-fal-fixture-sentinel');
  if (step === 0) {
    const body = JSON.parse(init.body);
    assert.equal(body.prompt, 'Return the fixture response');
    assert.equal(body.model, 'fixture/model');
  }
  appendFileSync(process.env.FAL_FIXTURE_TRACE, JSON.stringify({step,method,url})+'\n');
  return Response.json(responses[step++]);
};
