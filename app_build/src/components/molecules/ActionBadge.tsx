import { X } from "lucide-react";
import { Badge } from "../ui/badge";

interface ActionBadgeProps {
	label: string;
	color?: string; // Tailwind color name like 'indigo', 'red', or a valid css color
	onDelete?: () => void;
}

export function ActionBadge({
	label,
	color = "primary",
	onDelete,
}: ActionBadgeProps) {
	return (
		<Badge
			variant="secondary"
			className="flex items-center gap-1.5 px-3 py-1 text-sm font-semibold"
		>
			<span
				className="w-2.5 h-2.5 rounded-full"
				style={{
					backgroundColor: `var(--color-${color}-500, var(--${color}))`,
				}}
			></span>
			{label}
			{onDelete && (
				<button
					type="button"
					onClick={onDelete}
					className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
				>
					<X className="w-3.5 h-3.5" />
				</button>
			)}
		</Badge>
	);
}
