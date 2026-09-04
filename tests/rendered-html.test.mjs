import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the scalable Buy Overview", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const label of ["Ticker", "Price", "Fundamental Stage", "Fundamental Score", "Value", "Overheat", "ΔOverheat", "DCA Multiplier", "Action"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /Inactive Candidates/);
  assert.match(html, /Active/);
  assert.match(html, /LIGHT BUY/);
});

test("shows Fundamental Trend adjustment and keeps candidate selection user-controlled", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /Fundamental Trend로 DCA 보정/);
  assert.match(html, /Deactivate는 이력을 삭제하지 않습니다/);
  assert.doesNotMatch(html, /PASS만|Gate 확인 후 추가/);
});

test("preserves the no-sell safety boundary", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /0×는 매도가 아닌 신규 매수 중단/);
  assert.match(html, /SELL 기능 없음/);
  assert.doesNotMatch(html, />SELL</);
});

