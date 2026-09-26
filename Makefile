.PHONY: dev seed test demo-reset

dev:        ## run api + web
	(cd api && uvicorn app.main:app --reload --port 8000) & (cd web && pnpm dev)
seed:       ## rebuild data/encore.db deterministically
	python -m seed.seed && bash demo_photos/make_photos.sh
test:
	cd api && pytest -q
demo-reset: ## Sam back to unverified, photo attendances removed
	python -m seed.demo_reset
