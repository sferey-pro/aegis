import { describe, expect, test, mock, beforeEach } from "bun:test";
import { enqueueGlobalAudit, runSingleAudit, getAuditStatus } from "./queue";

const mockRunAudit = mock(async (id: number, force: boolean) => {
	// Simulate async work
	await new Promise((r) => setTimeout(r, 10));
	return { id, force };
});

mock.module("./index", () => ({
	runAudit: mockRunAudit,
}));

describe("Engine: Audit Queue", () => {
	beforeEach(() => {
		mockRunAudit.mockClear();
	});

	test("initial status is idle", () => {
		const status = getAuditStatus();
		expect(status.isRunning).toBe(false);
		expect(status.currentProject).toBeNull();
		expect(status.progress).toBe(0);
	});

	test("runSingleAudit sets status and locks queue", async () => {
		const promise = runSingleAudit(42, true);

		// Immediately check status
		const status = getAuditStatus();
		expect(status.isRunning).toBe(true);
		expect(status.currentProject).toBe(42);

		// Second call should fail
		expect(runSingleAudit(43, false)).rejects.toThrow(
			"Un audit est déjà en cours",
		);

		await promise;

		// Status should be back to normal
		const endStatus = getAuditStatus();
		expect(endStatus.isRunning).toBe(false);
		expect(mockRunAudit).toHaveBeenCalledTimes(1);
		expect(mockRunAudit.mock.calls[0]).toEqual([42, true]);
	});

	test("enqueueGlobalAudit processes sequentially and updates progress", async () => {
		enqueueGlobalAudit([1, 2, 3]);

		// Status immediately after enqueue
		let status = getAuditStatus();
		expect(status.isRunning).toBe(true);
		expect(status.total).toBe(3);
		expect(status.currentProject).toBe(1);
		expect(status.progress).toBe(0);

		// Global enqueue again should fail
		expect(() => enqueueGlobalAudit([4, 5])).toThrow(
			"Un audit est déjà en cours",
		);

		// Wait for processing to finish
		// Since enqueueGlobalAudit is fire-and-forget, we wait a bit
		await new Promise((r) => setTimeout(r, 50));

		const endStatus = getAuditStatus();
		expect(endStatus.isRunning).toBe(false);
		expect(endStatus.progress).toBe(0); // Resets to 0
		expect(mockRunAudit).toHaveBeenCalledTimes(3);
		expect(mockRunAudit.mock.calls[0]).toEqual([1, false]);
		expect(mockRunAudit.mock.calls[1]).toEqual([2, false]);
		expect(mockRunAudit.mock.calls[2]).toEqual([3, false]);
	});
});
