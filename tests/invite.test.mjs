import { test } from "node:test";
import assert from "node:assert/strict";
import { captureInvite, clearInvite } from "../src/invite.mjs";

function browser(hash) {
  const values = new Map();
  const b = {
    location: { hash, pathname: "/Progetto-capodanno/", search: "" },
    history: { replaceState: (_state, _title, path) => {
      b.cleanedPath = path;
      b.location.hash = "";
    } },
    sessionStorage: {
      getItem: k => values.get(k),
      setItem: (k, v) => values.set(k, v),
      removeItem: k => values.delete(k),
    },
  };
  return b;
}

test("invito conservato durante login e reload, rimosso dopo ingresso", () => {
  const b = browser("#invite=test_invite_123");
  assert.equal(captureInvite(b), "test_invite_123");
  assert.equal(b.cleanedPath, "/Progetto-capodanno/");
  assert.equal(captureInvite(b), "test_invite_123");
  clearInvite(b);
  assert.equal(captureInvite(b), "");
});

test("invito malformato non viene conservato", () => {
  const b = browser("#invite=%3Cscript%3E");
  assert.equal(captureInvite(b), "");
  assert.equal(b.location.hash, "");
});
