import React, { ReactElement } from "react";
import { render as tlRender, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export * from "@testing-library/react";

export function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return tlRender(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
    options
  );
}
