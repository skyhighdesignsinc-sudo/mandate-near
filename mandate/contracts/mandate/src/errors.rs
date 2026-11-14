//! Typed policy violations.
//!
//! Per AGENTS.md §4 every failure path returns a typed error, never a panic
//! with an ad-hoc string. The panic message the runtime records is exactly the
//! `code` (see `impl AsRef<str>`), so a judge can grep the failure receipt on
//! an explorer and match it against SCREENER.md without parsing prose.
//!
//! Details (amounts, rule names) are emitted as a `violation` log line before
//! the error is returned, so the demo and console can show context without
//! changing the machine-readable code.

use near_sdk::env;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyViolation {
    pub code: &'static str,
    /// `PolicyViolation: <code>` — the exact string a judge sees in the failed
    /// receipt and in SCREENER.md.
    message: String,
}

impl PolicyViolation {
    pub fn new(code: &'static str) -> Self {
        // Log before the panic. The release profile uses panic = "abort", which
        // compiles a panic into an `unreachable` trap: the message is gone by the
        // time a node reports it, so the receipt log is the only place the code
        // survives. That is what makes a refusal auditable on chain and not just
        // in this repository's tests.
        env::log_str(&format!("violation: {}", code));
        Self {
            code,
            message: format!("PolicyViolation: {}", code),
        }
    }

    /// Log context, then return the typed error. The log is best-effort; the
    /// code is the contract.
    pub fn fail(code: &'static str, detail: impl std::fmt::Display) -> Self {
        env::log_str(&format!("violation: {}: {}", code, detail));
        Self::new(code)
    }
}

impl AsRef<str> for PolicyViolation {
    fn as_ref(&self) -> &str {
        &self.message
    }
}

impl std::fmt::Display for PolicyViolation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

/// Frozen v1 code set. Adding a code requires a decision id in docs/DECISIONS.md.
pub const CODES: &[&str] = &[
    "amount_zero",
    "asset_mismatch",
    "attestation_mismatch",
    "attestation_required",
    "attestor_only",
    "budget_exhausted",
    "chain_not_enabled",
    "challenge_window_closed",
    "already_contested",
    "reason_invalid",
    "counterparty_not_allowed",
    "decision_replayed",
    "intent_consumed",
    "tx_replayed",
    "balance_reserved",
    "request_pending",
    "invalid_key",
    "mandate_expired",
    "mandate_suspended",
    "access_key_missing",
    "not_found",
    "owner_only",
    "per_counterparty_day_exceeded",
    "per_day_exceeded",
    "per_tx_exceeded",
    "policy_changed",
    "policy_invalid",
    "request_not_pending",
    "unauthorized",
];

pub type MResult<T> = Result<T, PolicyViolation>;