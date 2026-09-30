import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render as tlRender } from "@testing-library/react";
import type { ReactElement } from "react";

export * from "@testing-library/react";

export function render(
	ui: ReactElement,
	options?: Omit<RenderOptions, "wrapper">,
) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return tlRender(ui, {
		wrapper: ({ children }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		),
		...options,
	});
}
