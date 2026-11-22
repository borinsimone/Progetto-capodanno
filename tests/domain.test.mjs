import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCents, balances, settlements } from "../src/domain.mjs";
test("divisione esatta dei centesimi, stabile e senza duplicati", () => {
  assert.deepEqual(splitCents(100, ["b", "a", "c", "a"]), {
    a: 34,
    b: 33,
    c: 33,
  });
  assert.throws(() => splitCents(100, []));
  assert.throws(() => splitCents(-1, ["a"]));
});
test("anticipi, quote e versamenti confermati mantengono il totale a zero", () => {
  const profiles = [{ owner: "a" }, { owner: "b" }, { owner: "c" }];
  const expenses = [
    { owner: "a", payload: { cents: 100, people: ["a", "b", "c"] } },
    { owner: "b", payload: { cents: 200, people: ["b", "c"] } },
  ];
  const transfers = [
    { payload: { from: "c", to: "a", cents: 33, confirmed: true } },
    { payload: { from: "b", to: "a", cents: 33, confirmed: false } },
  ];
  const result = balances(profiles, expenses, transfers);
  assert.deepEqual(result, { a: 33, b: 67, c: -100 });
  assert.equal(
    Object.values(result).reduce((a, b) => a + b, 0),
    0
  );
  assert.deepEqual(settlements(result), [
    { from: "c", to: "a", cents: 33 },
    { from: "c", to: "b", cents: 67 },
  ]);
});
