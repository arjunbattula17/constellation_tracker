import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/server";

describe("GET /health", () => {
  it("returns 200 without requiring any query params, for host health checks", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
