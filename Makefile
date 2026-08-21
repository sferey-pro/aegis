.PHONY: dev build lint test coverage

dev:
	cd app_build && bun run dev

build:
	cd app_build && bun run build

lint:
	cd app_build && bun run lint

test:
	cd app_build && bun run test

coverage:
	cd app_build && bun run coverage
