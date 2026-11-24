import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCents, balances, settlements } from "../src/domain.mjs";

test("cenone e pernottamento: quote diverse, versamenti parziali e saldo finale", () => {
  const profiles = ["anna", "bruno", "carla", "davide"].map((owner) => ({
    owner,
  }));
  const expenses = [
    {
      owner: "anna",
      payload: { cents: 12001, people: ["anna", "bruno", "carla"] },
    },
    { owner: "bruno", payload: { cents: 9000, people: ["anna", "bruno"] } },
  ];
  const pending = {
    payload: { from: "carla", to: "anna", cents: 3500, confirmed: false },
  };
  const initial = { anna: 3500, bruno: 500, carla: -4000, davide: 0 };
  assert.deepEqual(balances(profiles, expenses, [pending]), initial);
  const received = { payload: { ...pending.payload, confirmed: true } };
  const partial = balances(profiles, expenses, [received]);
  assert.deepEqual(partial, { anna: 0, bruno: 500, carla: -500, davide: 0 });
  assert.deepEqual(settlements(partial), [
    { from: "carla", to: "bruno", cents: 500 },
  ]);
  const final = balances(profiles, expenses, [
    received,
    { payload: { from: "carla", to: "bruno", cents: 500, confirmed: true } },
  ]);
  assert.ok(Object.values(final).every((cents) => cents === 0));
});

test("cambiare presenza non ridistribuisce le spese già registrate; eliminare una spesa ricalcola i saldi", () => {
  const profiles = ["anna", "bruno", "carla"].map((owner) => ({
    owner,
    payload: { status: "yes", sleep: true },
  }));
  const stay = {
    owner: "anna",
    payload: { cents: 7501, people: ["anna", "bruno"] },
  };
  const dinner = {
    owner: "carla",
    payload: { cents: 4500, people: ["anna", "bruno", "carla"] },
  };
  const initial = balances(profiles, [stay, dinner], []);
  assert.deepEqual(initial, { anna: 2250, bruno: -5250, carla: 3000 });
  const updated = profiles.map((p) =>
    p.owner === "bruno" ? { ...p, payload: { status: "no", sleep: false } } : p
  );
  assert.deepEqual(balances(updated, [stay, dinner], []), initial);
  assert.deepEqual(balances(updated, [dinner], []), {
    anna: -1500,
    bruno: -1500,
    carla: 3000,
  });
});
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
