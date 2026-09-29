/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { createRoot } from "react-dom/client";
import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TooltipProvider } from "./components/ui/tooltip";

const elem = document.getElementById("root");
if (!elem) {
	throw new Error("Élément racine #root introuvable dans index.html");
}
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

const app = (
	<QueryClientProvider client={queryClient}>
		<BrowserRouter>
			<TooltipProvider delayDuration={200}>
				<App />
			</TooltipProvider>
		</BrowserRouter>
	</QueryClientProvider>
);

// https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
import.meta.hot.data.root ??= createRoot(elem);
import.meta.hot.data.root.render(app);
