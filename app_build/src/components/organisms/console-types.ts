export interface ConsoleEvent {
	id: number;
	phase: "start" | "end";
	cmd?: string;
	cwd?: string;
	label?: string;
	project?: string;
	exitCode?: number;
	/** Succès déclaré par le producteur, prioritaire sur `exitCode`. */
	ok?: boolean;
	ms?: number;
	outText?: string;
	errorText?: string;
}

export interface LogEntry {
	id: number;
	cmd: string;
	cwd: string;
	label: string;
	project?: string;
	status: "running" | "success" | "error";
	exitCode?: number;
	ms?: number;
	startTime: number;
	outText?: string;
	errorText?: string;
}
