import {
	AlertTriangle,
	Maximize2,
	Minimize2,
	Terminal,
	Trash2,
	X,
} from "lucide-react";
import { memo } from "react";
import { Button } from "../ui/button";

interface ConsoleHeaderProps {
	debugMode: boolean;
	setDebugMode: (val: boolean) => void;
	isMaximized: boolean;
	setIsMaximized: (val: boolean) => void;
	onClear: () => void;
	onClose: () => void;
}

export const ConsoleHeader = memo(function ConsoleHeader({
	debugMode,
	setDebugMode,
	isMaximized,
	setIsMaximized,
	onClear,
	onClose,
}: ConsoleHeaderProps) {
	return (
		<div className="flex items-center justify-between px-4 py-2 border-b select-none shrink-0 bg-background/50 backdrop-blur-sm">
			<div className="flex items-center gap-2 text-muted-foreground truncate mr-2">
				<Terminal className="w-4 h-4 shrink-0" />
				<span className="font-semibold text-xs tracking-wider truncate">
					AEGIS LIVE CONSOLE
				</span>
			</div>
			<div className="flex items-center gap-1 shrink-0">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => setDebugMode(!debugMode)}
					className={`transition-colors h-8 w-8 ${debugMode ? "text-primary" : "text-muted-foreground"}`}
					title="Mode Debug (Affiche stdout et stderr)"
				>
					<AlertTriangle className="w-4 h-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClear}
					className="text-muted-foreground h-8 w-8"
					title="Effacer la console"
				>
					<Trash2 className="w-4 h-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => setIsMaximized(!isMaximized)}
					className="text-muted-foreground h-8 w-8 hidden md:flex"
				>
					{isMaximized ? (
						<Minimize2 className="w-4 h-4" />
					) : (
						<Maximize2 className="w-4 h-4" />
					)}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					className="text-muted-foreground h-8 w-8"
				>
					<X className="w-5 h-5" />
				</Button>
			</div>
		</div>
	);
});
