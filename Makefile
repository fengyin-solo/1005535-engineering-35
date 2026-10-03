.PHONY: bootstrap install frontend build typecheck

# 起步引导：拉依赖、灌种子数据（新同事克隆后跑这一条）
bootstrap:
	node scripts/bootstrap.mjs

install:
	cd frontend && npm install

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

typecheck:
	cd frontend && npm run typecheck
