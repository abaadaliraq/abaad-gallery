import assert from "node:assert/strict";
import { test } from "node:test";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./helpers/load-ts.mjs";
import { createHash } from "node:crypto";
const { default: TopBar } = load("src/components/bookings/ProtocolTopBar.tsx", {
  "react/jsx-runtime": jsx,
  "@/components/protocol/ProtocolHeader": { default: () => null },
  "@/components/sections/LogoutButton": { default: () => null },
});
function descendants(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)];
}
function setup(overrides = {}) {
  const calls = [];
  const props = {
    staff: {}, tab: "bookings", unread: 3, notificationsOpen: false, scannerOpen: false,
    onSelectTab: tab => calls.push(tab), onNotifications: () => calls.push("bell"),
    onScan: () => calls.push("scan"), closePanels: () => {}, ...overrides,
  };
  const tree = TopBar(props);
  return { calls, tree, buttons: descendants(tree).filter(n => n.type === "button") };
}
test("protocol toolbar keeps bookings, bell and scan with no opening guests control", () => {
  const { calls, buttons } = setup();
  assert.equal(buttons.length, 3);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(calls, ["bookings", "bell", "scan"]);
  assert.equal(buttons[0].props["aria-controls"], "bookings-panel");
  assert.doesNotMatch(renderToStaticMarkup(setup().tree), /ضيوف الافتتاح|opening-panel/);
});
test("active view and open panels remain accessible with unread notifications", () => {
  const { tree, buttons } = setup({ tab: "bookings", notificationsOpen: true, scannerOpen: true });
  assert.equal(buttons[0].props["aria-pressed"], true);
  assert.equal(buttons[1].props["aria-expanded"], true);
  assert.equal(buttons[2].props["aria-expanded"], true);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /3 إشعار غير مقروء/);
  assert.match(html, /مسح QR/);
});
test("no unread badge is shown after notifications are read", () => {
  const { tree } = setup({ unread: 0 });
  assert.doesNotMatch(renderToStaticMarkup(tree), /إشعار غير مقروء/);
});

test("Protocol workspace mounts bookings immediately without a hidden guest dashboard", () => {
  const {default: Workspace}=load("src/components/bookings/ProtocolWorkspace.tsx",{
    "react/jsx-runtime":jsx,
    "./BookingDashboard":{default:props=>jsx.jsx("section",{"data-bookings":true,"data-collapsed":!!props.collapsed,children:"الحجوزات"})},
    "./ProtocolTopBar":{default:()=>null},
  });
  const html=renderToStaticMarkup(jsx.jsx(Workspace,{staff:{user_id:"test"}}));
  assert.match(html,/data-bookings="true"/);assert.match(html,/data-collapsed="false"/);
  assert.doesNotMatch(html,/opening-panel|ضيوف/);
});

test("booking search skips opening guests for Protocol and preserves Admin unified search",async()=>{
  const calls=[];
  const {bookingGet}=load("src/lib/bookings/http.ts",{
    "node:crypto":{createHash},
    "@/lib/protocol/access":{protocolClient:async()=>({rpc:async name=>{calls.push(name);return {data:name==='booking_snapshot'?{bookings:[],total_matches:0}:{guests:[],total_matches:0},error:null};}})},
    "@/lib/protocol/config":{protocolSlug:()=>"naima-baghdad-2026"},
    "@/lib/protocol/queries":{privateHeaders:{}},
  });
  const request=()=>new Request('https://example.test/api/protocol/bookings?q=test');
  const protocol=await bookingGet(request(),'protocol');assert.equal(protocol.status,200);assert.deepEqual(calls,['booking_snapshot']);assert.equal((await protocol.json()).opening,undefined);
  calls.length=0;const admin=await bookingGet(request(),'admin');assert.equal(admin.status,200);assert.deepEqual(calls,['booking_snapshot','protocol_snapshot']);assert.ok((await admin.json()).opening);
});
