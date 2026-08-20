import type { LucideIcon } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

interface FilterDropdownProps {
	icon?: LucideIcon;
	placeholder?: string;
	value?: string;
	onValueChange?: (value: string) => void;
	options: { label: string; value: string }[];
}

export function FilterDropdown({
	icon: Icon,
	placeholder = "Filtrer...",
	value,
	onValueChange,
	options,
}: FilterDropdownProps) {
	return (
		<div className="flex items-center gap-2">
			{Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
			<Select value={value} onValueChange={onValueChange}>
				<SelectTrigger className="w-[180px]">
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
