import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "bun";
import { errorMessage } from "@/lib/utils";
import { emitConsoleEnd, emitConsoleStart } from "../console";

export interface GitInfo {
	isRepo: boolean;
	branch: string | null;
	sha: string | null;
	upstream: string | null;
	ahead: number;
	behind: number;
	dirty: boolean;
}

const GIT_ENV = {
	...process.env,
	GIT_OPTIONAL_LOCKS: "0",
	GIT_TERMINAL_PROMPT: "0",
};

/**
 * Expands ~ to homedir
 */
export function expandPath(path: string): string {
	if (path.startsWith("~/")) {
		return resolve(homedir(), path.slice(2));
	}
	if (path === "~") {
		return homedir();
	}
	return resolve(path);
}

/**
 * Helper to run a git command and return its output.
 * Throws if the command fails, unless tolerateFailure is true.
 */
async function runGit(
	args: string[],
	cwd: string,
	tolerateFailure = false,
): Promise<string> {
	const cmdLine = `git ${args.join(" ")}`;
	const startTime = Date.now();
	const eventId = emitConsoleStart({ cmd: cmdLine, cwd, label: "git" });

	const proc = spawn(["git", ...args], {
		cwd,
		env: GIT_ENV,
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	emitConsoleEnd(eventId, {
		exitCode,
		ms: Date.now() - startTime,
		outText: stdout.trim(),
		errorText: stderr.trim(),
	});

	if (exitCode !== 0 && !tolerateFailure) {
		throw new Error(`Git command failed with code ${exitCode}`);
	}
	return stdout.trim();
}

export async function getGitInfo(rawPath: string): Promise<GitInfo> {
	const cwd = expandPath(rawPath);

	const info: GitInfo = {
		isRepo: false,
		branch: null,
		sha: null,
		upstream: null,
		ahead: 0,
		behind: 0,
		dirty: false,
	};

	try {
		// 1. isRepo
		const isInside = await runGit(
			["rev-parse", "--is-inside-work-tree"],
			cwd,
			true,
		);
		if (isInside !== "true") {
			return info; // not a repo
		}
		info.isRepo = true;

		// 2. branch
		const branch = await runGit(
			["rev-parse", "--abbrev-ref", "HEAD"],
			cwd,
			true,
		);
		if (branch && !branch.includes("fatal:")) info.branch = branch;

		// 3. sha
		const sha = await runGit(["rev-parse", "HEAD"], cwd, true);
		if (sha && !sha.includes("fatal:")) info.sha = sha;

		// 4. upstream
		const upstream = await runGit(
			["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
			cwd,
			true,
		);
		if (upstream && !upstream.includes("fatal:")) {
			info.upstream = upstream;

			// 5. ahead / behind (only if upstream exists)
			const counts = await runGit(
				["rev-list", "--left-right", "--count", "@{u}...HEAD"],
				cwd,
				true,
			);
			if (counts && !counts.includes("fatal:")) {
				// Output format: "<behind>\t<ahead>" (left is upstream, right is HEAD)
				const [behindStr, aheadStr] = counts.split("\t");
				if (behindStr !== undefined && aheadStr !== undefined) {
					info.behind = parseInt(behindStr, 10) || 0;
					info.ahead = parseInt(aheadStr, 10) || 0;
				}
			}
		}

		// 6. dirty
		const status = await runGit(["status", "--porcelain"], cwd, true);
		if (!status.includes("fatal:")) {
			info.dirty = status.length > 0;
		}
	} catch (_e) {
		// if cwd doesn't exist, spawn will throw or runGit will throw
		// we just return isRepo = false
	}

	return info;
}

export async function gitFetch(
	rawPath: string,
): Promise<{ ok: boolean; log: string }> {
	const cwd = expandPath(rawPath);
	const startTime = Date.now();
	const eventId = emitConsoleStart({
		cmd: "git fetch --verbose",
		cwd,
		label: "git",
	});

	try {
		const proc = spawn(["git", "fetch", "--verbose"], {
			cwd,
			env: GIT_ENV,
			stdout: "pipe",
			stderr: "pipe",
		});

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;
		emitConsoleEnd(eventId, {
			exitCode,
			ms: Date.now() - startTime,
			errorText: exitCode !== 0 ? stderr.trim() : undefined,
		});

		let log = stderr + stdout;

		if (exitCode === 0 && log.trim() === "") {
			log = "Déjà à jour.";
		}

		return { ok: exitCode === 0, log: log.trim() };
	} catch (e: unknown) {
		emitConsoleEnd(eventId, {
			exitCode: 1,
			ms: Date.now() - startTime,
			errorText: errorMessage(e),
		});
		return { ok: false, log: `chemin introuvable ou erreur système` };
	}
}

export async function gitPull(
	rawPath: string,
): Promise<{ ok: boolean; log: string }> {
	const cwd = expandPath(rawPath);
	const startTime = Date.now();
	const eventId = emitConsoleStart({
		cmd: "git pull --ff-only",
		cwd,
		label: "git",
	});

	try {
		const proc = spawn(["git", "pull", "--ff-only"], {
			cwd,
			env: GIT_ENV,
			stdout: "pipe",
			stderr: "pipe",
		});

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;
		emitConsoleEnd(eventId, {
			exitCode,
			ms: Date.now() - startTime,
			errorText: exitCode !== 0 ? stderr.trim() : undefined,
		});

		let log = stdout + stderr;
		if (exitCode !== 0 && log.trim() === "") {
			log = "échec du pull (non fast-forward ?)";
		}

		return { ok: exitCode === 0, log: log.trim() };
	} catch (e: unknown) {
		emitConsoleEnd(eventId, {
			exitCode: 1,
			ms: Date.now() - startTime,
			errorText: errorMessage(e),
		});
		return { ok: false, log: "chemin introuvable ou erreur système" };
	}
}
