import { describe, expect, it } from "vitest";
import { searchHelp } from "../src/help";

const item = (id: string, title: string, body: string) => ({ id, title, body, updatedAt: 0 });
const items = [
  item("plans", "What plans are there?", "Free, Plus and Pro. A refund goes through Apple."),
  item("refund", "How do I get a refund?", "Ask Apple at reportaproblem.apple.com."),
  item("donnees", "Où sont mes données ?", "En Europe."),
];

describe("searchHelp", () => {
  it("ranks title matches above answer-only matches, then keeps the owner's order", () => {
    expect(searchHelp(items, "refund").map((a) => a.id)).toEqual(["refund", "plans"]);
  });

  it("needs every word, in the title or the answer", () => {
    expect(searchHelp(items, "refund apple").map((a) => a.id)).toEqual(["refund", "plans"]);
    expect(searchHelp(items, "refund android")).toEqual([]);
  });

  it("ignores accents, case and punctuation", () => {
    expect(searchHelp(items, "DONNEES?").map((a) => a.id)).toEqual(["donnees"]);
  });

  it("returns everything in order for an empty query", () => {
    expect(searchHelp(items, "  ").map((a) => a.id)).toEqual(["plans", "refund", "donnees"]);
  });
});
