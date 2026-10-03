.PHONY: setup install reset frontend build

# 新同事第一步：拉依赖 + 校验种子数据（详见 README「快速开始」）
setup:
	cd frontend && npm run setup

install:
	cd frontend && npm install

# 本地开发复位：校验种子、清构建缓存；浏览器旧数据在概览页点「复位本地数据」
reset:
	cd frontend && npm run reset

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
