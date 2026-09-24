import { describe, expect, it } from "vitest";

import { applyMutations, parseMutations } from "@/lib/mutations";
import {
  applyPayloadMutations,
  payloadMutationsFromEdit,
} from "@/lib/payload-path";

const original = {
  orderId: "ord_1",
  amount: 5000,
  customer: { email: "a@example.com", tier: "gold" },
  items: [
    { sku: "A", price: 10 },
    { sku: "B", price: 20 },
  ],
};

function roundTrip(edited: unknown) {
  const result = payloadMutationsFromEdit(original, edited);

  if ("error" in result) {
    throw new Error(result.error);
  }

  return result.mutations;
}

describe("payloadMutationsFromEdit", () => {
  it("returns no mutations when nothing changed", () => {
    expect(roundTrip(structuredClone(original))).toEqual([]);
  });

  it("sets only the leaves that changed", () => {
    const edited = structuredClone(original);
    edited.amount = 0;
    edited.items[1].price = 0;

    expect(roundTrip(edited)).toEqual([
      { target: "payload", op: "set", path: "amount", value: 0 },
      { target: "payload", op: "set", path: "items.1.price", value: 0 },
    ]);
  });

  it("removes deleted keys and adds new ones", () => {
    const { customer, ...rest } = structuredClone(original);

    const edited = {
      ...rest,
      customer: { email: customer.email },
      coupon: "SAVE10",
    };

    expect(roundTrip(edited)).toEqual([
      { target: "payload", op: "remove", path: "customer.tier" },
      { target: "payload", op: "set", path: "coupon", value: "SAVE10" },
    ]);
  });

  it("replaces an array whose length changed", () => {
    const edited = { ...structuredClone(original), items: [] };

    expect(roundTrip(edited)).toEqual([
      { target: "payload", op: "set", path: "items", value: [] },
    ]);
  });

  it("replaces an object whose keys a path cannot name", () => {
    const edited = {
      ...structuredClone(original),
      customer: { "e.mail": "b@example.com" },
    };

    expect(roundTrip(edited)).toEqual([
      {
        target: "payload",
        op: "set",
        path: "customer",
        value: { "e.mail": "b@example.com" },
      },
    ]);
  });

  it("refuses to replace the top level", () => {
    expect(payloadMutationsFromEdit(original, [1, 2])).toHaveProperty("error");
    expect(payloadMutationsFromEdit(original, null)).toHaveProperty("error");
  });

  it("produces mutations the server accepts and that reproduce the edit", () => {
    const edited = structuredClone(original);
    edited.amount = -1;
    edited.customer.tier = "silver";

    const mutations = roundTrip(edited);

    const parsed = parseMutations(mutations);

    expect(parsed).toHaveProperty("mutations");

    const applied = applyMutations(
      {
        url: new URL("http://localhost/api/checkout"),
        headers: {},
        payload: original,
      },
      "mutations" in parsed ? parsed.mutations : [],
    );

    expect(applied.payload).toEqual(edited);
    expect(applyPayloadMutations(original, mutations)).toEqual(edited);
  });

  it("never modifies the original", () => {
    const snapshot = structuredClone(original);

    applyPayloadMutations(original, [
      { target: "payload", op: "set", path: "amount", value: 1 },
      { target: "payload", op: "remove", path: "items.0" },
    ]);

    expect(original).toEqual(snapshot);
  });
});
