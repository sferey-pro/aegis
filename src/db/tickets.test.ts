import { afterAll, beforeAll, expect, test } from "bun:test";
import { closeDb, getDb } from "./index";
import { createProject } from "./projects";
import { deleteTicket, getTickets, saveTicket } from "./tickets";

beforeAll(() => {
	getDb();
});

afterAll(() => {
	closeDb();
});

test("Database: Tickets > can link, retrieve and unlink tickets", () => {
	const pId = createProject({
		name: "JiraTest",
		path: "/",
		tool: "npm",
		type: "node",
		tags: [],
		is_remote: false,
	}).id;

	saveTicket(pId, "express", "https://jira/SEC-123", []);
	saveTicket(pId, "react", "https://jira/SEC-456", []);

	let allTickets = getTickets();
	expect(
		allTickets.find((t) => t.project_id === pId && t.package === "express")
			?.url,
	).toBe("https://jira/SEC-123");
	expect(
		allTickets.find((t) => t.project_id === pId && t.package === "react")?.url,
	).toBe("https://jira/SEC-456");

	deleteTicket(pId, "express");
	allTickets = getTickets();
	expect(
		allTickets.find((t) => t.project_id === pId && t.package === "express"),
	).toBeUndefined();
	expect(
		allTickets.find((t) => t.project_id === pId && t.package === "react")?.url,
	).toBe("https://jira/SEC-456");
});
