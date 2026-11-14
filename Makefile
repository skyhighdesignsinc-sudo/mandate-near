# Mandate — root Makefile.
# Every target here works from a fresh clone with no secrets (AGENTS.md §3).
# A target is added only when the thing it runs exists; a target that calls a
# missing script is a lie in a README.

SHELL := /bin/bash
NODE ?= node
PORT ?= 4173
CARGO_DIR := mandate/contracts/mandate
DOCKER_RUST ?= rust:1
CARGO_TARGET ?= /w/.tools/cargo-target-linux
SNAP := mandate/console/data/snapshot.json

# docker on Windows wants C:/… for the mount source, and MSYS mangles /w/… in -w.
MOUNT := $(shell cygpath -m "$(CURDIR)" 2>/dev/null || echo "$(CURDIR)")
UNAME := $(shell uname -s 2>/dev/null || echo unknown)
ON_WINDOWS := $(findstring MINGW,$(UNAME))$(findstring MSYS,$(UNAME))$(findstring CYGWIN,$(UNAME))
HAS_DOCKER := $(shell command -v docker >/dev/null 2>&1 && echo yes)
HAS_CARGO := $(shell command -v cargo >/dev/null 2>&1 && echo yes)


help:
	@echo "make dev        console on http://127.0.0.1:$(PORT) (builds the snapshot if missing)"
	@echo "make demo       deterministic contract replay, then compare against the expected output"
	@echo "make verify     recompute policy + intent hashes from the snapshot (no trust in the UI)"
	@echo "make doctor     print ACTIVE / FALLBACK per module; exits 1 on any fallback"
	@echo "make test       contract unit tests (cargo on this machine)"
	@echo "make test-linux contract unit tests in a Linux container (reference environment)"
	@echo "make test-api   API + MCP tests (node --test, needs `make demo` first)"
	@echo "make api        read API on http://127.0.0.1:4174 (a key is required)"
	@echo "make mcp        MCP server on stdio, for an assistant client"
	@echo "make keys       issue/list/revoke read-API keys (make keys ARGS='issue --label me')"
	@echo "make contract-wasm  build the wasm in the reference container"
	@echo "make deploy     deploy to testnet (needs a funded account; see docs/PENDING-HUMAN.md)"
	@echo "make chain-demo ACCOUNT=<id.testnet>  real spend + real refusal on testnet → console/data/chain.json"
	@echo "make key-demo ACCOUNT=<id.testnet>    add a key, revoke it, prove the protocol refuses it (C25)"
	@echo "make e2e        Playwright + axe against the console"
	@echo "make uat        the five acceptance journeys only (faster than make e2e)"
	@echo "make docs       render docs/*.md into the console's Paper route"
	@echo "make diagrams   re-render the Mermaid blocks to SVG (needs npm install)"
	@echo "make design     design gallery on http://127.0.0.1:4321"

install:
	npm install --no-audit --no-fund
	npx playwright install chromium

# The judge path: one command, no secrets, no network at runtime.
dev:
	@test -f $(SNAP) || $(MAKE) demo
	@$(NODE) tools/build-docs.mjs
	@echo ""
	@echo "  console: http://127.0.0.1:$(PORT)"
	@echo "  stop with ctrl-c"
	@echo ""
	@$(NODE) tools/serve-console.mjs $(PORT)

console:
	@$(NODE) tools/serve-console.mjs $(PORT)

# Deterministic replay: real contract calls in near-sdk's test VM, serialised to
# the snapshot the console renders. Prefer a native toolchain; on Windows the C
# dependencies cannot build (D-008), so use the container.
demo:
	@if [ -n "$(ON_WINDOWS)" ] && [ -n "$(HAS_DOCKER)" ]; then \
	  $(MAKE) demo-linux; \
	elif [ -n "$(HAS_CARGO)" ]; then \
	  cd $(CARGO_DIR) && MANDATE_DEMO_OUT="$(CURDIR)/$(SNAP)" cargo test demo::replay -- --nocapture --test-threads=1; \
	elif [ -n "$(HAS_DOCKER)" ]; then \
	  $(MAKE) demo-linux; \
	else \
	  echo "make demo: needs cargo or docker"; exit 1; \
	fi
	@$(NODE) tools/demo-report.mjs

demo-linux:
	@mkdir -p mandate/console/data
	MSYS_NO_PATHCONV=1 docker run --rm \
	  -v "$(MOUNT):/w" \
	  -v "$(MOUNT)/.tools/cargo-registry:/usr/local/cargo/registry" \
	  -e CARGO_TARGET_DIR=$(CARGO_TARGET) \
	  -e MANDATE_DEMO_OUT=/w/$(SNAP) \
	  -w /w/$(CARGO_DIR) \
	  $(DOCKER_RUST) cargo test demo::replay -- --nocapture --test-threads=1

docs:
	@$(NODE) tools/build-docs.mjs

diagrams:
	@$(NODE) tools/render-diagrams.mjs

# Submission #2's only input: the contract's own views, read over RPC, no signing.
# The dataset, the two JSON files and the sentences that quote them must agree.
# whether every transaction in the dataset exists.
# D-024: prove the challenge window on testnet (writes to testnet state).
contest-demo:
	@$(NODE) tools/contest-demo.mjs $(ARGS)

# F-3: what the field's own published accounts hold — access keys, read-only.
# The acceptance journeys, written as user goals rather than component checks.
uat:
	npx playwright test e2e/uat.spec.mjs

verify:
	@$(NODE) tools/verify.mjs $(SNAP)

doctor:
	@$(NODE) tools/doctor.mjs

test:
	cd $(CARGO_DIR) && cargo test

test-linux:
	MSYS_NO_PATHCONV=1 docker run --rm \
	  -v "$(MOUNT):/w" \
	  -v "$(MOUNT)/.tools/cargo-registry:/usr/local/cargo/registry" \
	  -e CARGO_TARGET_DIR=$(CARGO_TARGET) \
	  -w /w/$(CARGO_DIR) \
	  $(DOCKER_RUST) cargo test

# The read API and the MCP server read the same snapshot the console renders.
api:
	@$(NODE) tools/api-server.mjs 4174

mcp:
	@$(NODE) tools/mcp-server.mjs

keys:
	@$(NODE) tools/keys.mjs $(ARGS)

test-api:
	@$(NODE) --test tools/api.test.mjs

contract-wasm:
	@mkdir -p mandate/contracts/mandate/out
	MSYS_NO_PATHCONV=1 docker run --rm \
	  -v "$(MOUNT):/w" \
	  -v "$(MOUNT)/.tools/cargo-registry:/usr/local/cargo/registry" \
	  -e CARGO_TARGET_DIR=/w/.tools/cargo-target-wasm \
	  -w /w/$(CARGO_DIR) \
	  $(DOCKER_RUST) bash -c "export PATH=/usr/local/cargo/bin:$$PATH && rustup target add wasm32-unknown-unknown && cargo build --release --target wasm32-unknown-unknown && cp /w/.tools/cargo-target-wasm/wasm32-unknown-unknown/release/mandate.wasm /w/mandate/contracts/mandate/out/ && ls -l /w/mandate/contracts/mandate/out/"

deploy:
	@$(NODE) tools/deploy-testnet.mjs

# Real calls on testnet: one authorised spend, one on-chain refusal, one settle.
# Writes mandate/console/data/chain.json, which the console's Verify page renders.
chain-demo:
	@$(NODE) tools/chain-demo.mjs --account $(or $(ACCOUNT),$(MANDATE_CONTRACT))

# C25: revocation removes the key from the account, not only the permission.
# Adds a throwaway key, revokes it, resumes the mandate, exits 1 on disagreement.
key-demo:
	@$(NODE) tools/key-demo.mjs --account $(or $(ACCOUNT),$(MANDATE_CONTRACT))

e2e:
	npx playwright test

design:
	@$(NODE) tools/serve-design.mjs 4321

# What to run before a handoff (AGENTS.md §6).
check: test test-api verify demo
	@echo "check: contract tests, verification and demo all passed"
