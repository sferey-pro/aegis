import { describe, it, expect, beforeAll } from "bun:test";
import * as http from "node:http";

const BASE_URL = "http://localhost:3001";

function request(path: string, options: http.RequestOptions = {}, body?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE_URL + path, options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 500, data: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode || 500, data });
        }
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

describe("Aegis Functional API Tests", () => {
  let createdProjectId: number;

  it("should fetch dashboard statistics", async () => {
    const res = await request("/api/stats");
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("monitoredProjects");
    expect(res.data).toHaveProperty("criticalVulnerabilities");
  });

  it("should fetch projects list", async () => {
    const res = await request("/api/projects");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("should create a new project", async () => {
    const payload = {
      name: "Test Func Project",
      path: process.cwd(),
      tool: "npm",
      type: "application"
    };

    const res = await request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, payload);

    if (res.status !== 200) {
      console.log("Project creation failed:", res.data);
    }
    expect(res.status).toBe(200);
    expect(res.data.id).toBeDefined();
    expect(res.data.name).toBe("Test Func Project");
    
    createdProjectId = res.data.id;
  });

  it("should fetch the newly created project by ID", async () => {
    expect(createdProjectId).toBeDefined();
    
    const res = await request(`/api/projects/${createdProjectId}`);
    expect(res.status).toBe(200);
    
    expect(res.data.id).toBe(createdProjectId);
    expect(res.data.name).toBe("Test Func Project");
    expect(res.data.tool).toBe("npm");
  });

  it("should fetch CVEs triage groups", async () => {
    const res = await request("/api/cves");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("should delete the created project", async () => {
    expect(createdProjectId).toBeDefined();

    const res = await request(`/api/projects/${createdProjectId}`, {
      method: "DELETE"
    });
    
    expect(res.status).toBe(200);
    
    // Verify it's gone
    const fetchRes = await request(`/api/projects/${createdProjectId}`);
    expect(fetchRes.status).toBe(404);
  });
});
