import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./helpers/load-ts.mjs";
const overrides = { react: React, "react/jsx-runtime": jsx, "./QrReader": { default: () => jsx.jsx("video", { "aria-label": "camera" }) }, "@/components/ui/LoadingIndicator": { default: () => jsx.jsx("span", { children: "تحميل" }) } };
const { default: Screen, scanResultTitle } = load("src/components/bookings/ScanScreen.tsx", overrides);
const noop = () => {};
const props = { camera: false, result: null, onRead: noop, onClose: noop, onRetry: noop, onMatched: noop };
test("camera and pending verification occupy their own full-screen dialog, not the booking list", () => {
  const html = renderToStaticMarkup(jsx.jsx(Screen, { ...props, camera: true }));
  assert.match(html, /<dialog/); assert.match(html, /h-dvh/); assert.match(html, /w-screen/); assert.match(html, /<video/);
  assert.doesNotMatch(html, /إجمالي الحجوزات/);
  const pending = renderToStaticMarkup(jsx.jsx(Screen, { ...props, result: "pending" }));
  assert.match(pending, /جارٍ التحقق/); assert.doesNotMatch(pending, /تم التحقق بنجاح/);
});
test("invalid/unknown codes use a simple mismatch page while connection/access failures keep their meaning", () => {
  assert.equal(scanResultTitle({ kind: "rejected", reason: "format", message: "bad" }), "الباركود غير مطابق");
  assert.equal(scanResultTitle({ kind: "rejected", reason: "unknown", message: "bad" }), "الباركود غير مطابق");
  assert.equal(scanResultTitle({ kind: "connection", message: "offline" }), "تعذر الاتصال");
  assert.equal(scanResultTitle({ kind: "rejected", reason: "access", message: "no access" }), "لا يمكن قبول الحجز");
  const html = renderToStaticMarkup(jsx.jsx(Screen, { ...props, result: { kind: "rejected", reason: "unknown", message: "bad" } }));
  assert.match(html, /×/); assert.match(html, /الباركود غير مطابق/); assert.doesNotMatch(html, /تم التحقق بنجاح/);
});
test("verified success flashes a check then opens the exact booking; cancelled transition never navigates", async () => {
  const effects = [], matched = [];
  const { default: ScreenWithEffects } = load("src/components/bookings/ScanScreen.tsx", { ...overrides, react: { useRef: value => ({ current: value }), useState: value => [value, noop], useEffect: effect => effects.push(effect) } });
  const booking = { id: "isolated-booking", full_name: "اختبار معزول" };
  const tree = ScreenWithEffects({ ...props, result: { kind: "success", message: "ok", booking }, onMatched: value => matched.push(value) });
  assert.match(renderToStaticMarkup(tree), /✓/); assert.equal(matched.length, 0);
  const cleanup = effects.at(-1)();
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.deepEqual(matched, [booking]); cleanup();
  effects.length = 0;
  ScreenWithEffects({ ...props, result: { kind: "success", message: "ok", booking }, onMatched: () => assert.fail("stale navigation") });
  const cancel = effects.at(-1)(); cancel();
  await new Promise(resolve => setTimeout(resolve, 700));
});
test("actual camera video fills the viewport region and preserves inline muted playback on phones", () => {
  const { default: Camera } = load("src/components/bookings/QrReader.tsx", { react: React, "react/jsx-runtime": jsx });
  const html = renderToStaticMarkup(jsx.jsx(Camera, { onRead: noop, onClose: noop }));
  assert.match(html, /object-cover/); assert.match(html, /h-full w-full/); assert.match(html, /playsInline/); assert.match(html, /muted/);
  assert.doesNotMatch(html, /max-h-64/);
});
