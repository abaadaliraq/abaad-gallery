import assert from "node:assert/strict";
import { test } from "node:test";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./helpers/load-ts.mjs";
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
    staff: {}, tab: "opening", unread: 3, notificationsOpen: false, scannerOpen: false,
    onSelectTab: tab => calls.push(tab), onNotifications: () => calls.push("bell"),
    onScan: () => calls.push("scan"), closePanels: () => {}, ...overrides,
  };
  const tree = TopBar(props);
  return { calls, tree, buttons: descendants(tree).filter(n => n.type === "button") };
}
test("protocol toolbar routes each of its four controls to the existing action", () => {
  const { calls, buttons } = setup();
  assert.equal(buttons.length, 4);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(calls, ["opening", "bookings", "bell", "scan"]);
  assert.equal(buttons[0].props["aria-controls"], "opening-panel");
  assert.equal(buttons[1].props["aria-controls"], "bookings-panel");
});
test("active view and open panels remain accessible with unread notifications", () => {
  const { tree, buttons } = setup({ tab: "bookings", notificationsOpen: true, scannerOpen: true });
  assert.equal(buttons[0].props["aria-pressed"], false);
  assert.equal(buttons[1].props["aria-pressed"], true);
  assert.equal(buttons[2].props["aria-expanded"], true);
  assert.equal(buttons[3].props["aria-expanded"], true);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /3 إشعار غير مقروء/);
  assert.match(html, /مسح QR/);
});
test("no unread badge is shown after notifications are read", () => {
  const { tree } = setup({ unread: 0 });
  assert.doesNotMatch(renderToStaticMarkup(tree), /إشعار غير مقروء/);
});
