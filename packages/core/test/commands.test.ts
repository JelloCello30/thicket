import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/commands";

const ctx = {
  groups: [
    { id: "g1", name: "Apartment Hunt", entity: "Silver Lake" },
    { id: "g2", name: "Tokyo Trip", entity: "Tokyo" },
    { id: "g3", name: "Camera Research" },
    { id: "g4", name: "Work — Pricing Launch" },
  ],
  workspaces: [
    { id: "w1", title: "Tokyo — October Trip" },
    { id: "w2", title: "Camera Research" },
    { id: "w3", title: "Desk Setup" },
  ],
};

describe("parseCommand", () => {
  it("finds things", () => {
    expect(parseCommand("find my tokyo hotel tabs", ctx)).toMatchObject({
      type: "search",
      query: expect.stringContaining("tokyo hotel"),
    });
    expect(parseCommand("where was the article about local-first software?", ctx)).toMatchObject({
      type: "search",
      scope: "history",
    });
  });

  it("closes what you don't need", () => {
    expect(parseCommand("close tabs I probably don't need", ctx)).toEqual({
      type: "close",
      target: "stale",
    });
    expect(parseCommand("close duplicates", ctx)).toMatchObject({ type: "close", target: "duplicates" });
    expect(parseCommand("close the camera research group", ctx)).toEqual({
      type: "close",
      target: "group",
      groupId: "g3",
    });
  });

  it("saves groups and topics", () => {
    expect(parseCommand("save everything related to Japan", ctx)).toMatchObject({ type: "save" });
    expect(parseCommand("save the apartment hunt", ctx)).toEqual({
      type: "save",
      target: "group",
      groupId: "g1",
    });
  });

  it("restores workspaces", () => {
    expect(parseCommand("reopen yesterday's camera research", ctx)).toEqual({
      type: "restore",
      workspaceId: "w2",
    });
    expect(parseCommand("bring back the tokyo trip", ctx)).toEqual({
      type: "restore",
      workspaceId: "w1",
    });
  });

  it("summarizes", () => {
    expect(parseCommand("summarize my apartment research", ctx)).toEqual({
      type: "summarize",
      groupId: "g1",
    });
  });

  it("compares", () => {
    expect(parseCommand("compare these laptops", ctx)).toMatchObject({ type: "compare" });
    expect(parseCommand("compare", ctx)).toEqual({ type: "compare", groupId: undefined });
  });

  it("cleans up", () => {
    expect(parseCommand("clear the noise", ctx)).toEqual({ type: "cleanup" });
    expect(parseCommand("clean up", ctx)).toEqual({ type: "cleanup" });
  });

  it("routes questions to AI", () => {
    expect(parseCommand("what was I researching last Tuesday?", ctx)).toMatchObject({ type: "ask" });
  });

  it("shows groups by bare name", () => {
    expect(parseCommand("apartment hunt", ctx)).toEqual({ type: "show_group", groupId: "g1" });
    expect(parseCommand("show only the tabs relevant to my pricing launch", ctx)).toEqual({
      type: "show_group",
      groupId: "g4",
    });
  });

  it("never dead-ends: unknown input becomes search", () => {
    expect(parseCommand("rooftop echo park", ctx)).toMatchObject({ type: "search" });
  });

  it("pauses and resumes", () => {
    expect(parseCommand("pause", ctx)).toEqual({ type: "pause" });
    expect(parseCommand("pause thicket", ctx)).toEqual({ type: "pause" });
    expect(parseCommand("resume", ctx)).toEqual({ type: "resume" });
  });
});
