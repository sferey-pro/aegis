import type React from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface LabelInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	label: string;
	error?: string;
}

export function LabelInput({ label, error, id, ...props }: LabelInputProps) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id} className={error ? "text-destructive" : ""}>
				{label}
			</Label>
			<Input id={id} className={error ? "border-destructive" : ""} {...props} />
			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}
