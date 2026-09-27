.PHONY: dev seed test demo-reset

dev:        ## run api + web
	(cd api && uvicorn app.main:app --reload --port 8000) & (cd web && pnpm dev)
seed:       ## rebuild data/encore.db deterministically (and the seeded demo media under data/media)
	python -m seed.seed
test:
	cd api && pytest -q
demo-reset: ## demo user back to unverified, d01–d06 and uploads removed
	python -m seed.demo_reset
