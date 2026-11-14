//! The policy object: what the agent is allowed to do, hashed on-chain.
//!
//! Amounts are `U128` (JSON strings) so a browser never loses precision.
//! `per_day` is a calendar day in UTC, derived from `block_timestamp`.
//! `escalate_over` is the human-approval threshold; it must be <= `per_tx`.
//!
//! `attestation_code_hash` is the measurement of the code allowed to decide.
//! When set, a spend whose attestation names a different code hash is refused.
//! The contract compares a hash; it does not verify Intel's signature. That
//! happens in the verifier page, and the README says so.

use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::serde_json;

use crate::errors::PolicyViolation;
use crate::util::sha256_hex;

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct AllowEntry {
    pub chain: String,
    pub to: String,
    pub label: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Policy {
    pub version: u32,
    /// Asset the mandate spends, e.g. "USDC". One asset per mandate in v1.
    pub asset: String,
    /// Block height after which the mandate is inert. 0 = no expiry.
    pub expires_at_block: u64,
    /// The allowlist. A vendor not listed for the chain is refused.
    pub allow: Vec<AllowEntry>,
    pub per_tx: U128,
    pub per_day: U128,
    pub per_counterparty_day: U128,
    /// Above this amount the spend becomes a pending request for the owner.
    pub escalate_over: U128,
    /// When true, `spend` requires a recorded attestation for the decision hash.
    pub require_attestation: bool,
    /// When set, the attestation's code hash must equal this value.
    pub attestation_code_hash: Option<String>,
}

impl Policy {
    /// Deterministic JSON: struct field order is fixed, U128 serializes as a
    /// decimal string. The console recomputes this hash from the same object.
    pub fn hash(&self) -> String {
        let json = serde_json::to_string(self).expect("policy serializes");
        sha256_hex(json.as_bytes())
    }

    pub fn validate(&self) -> Result<(), PolicyViolation> {
        if self.version != 1 {
            return Err(PolicyViolation::fail("policy_invalid", "version must be 1"));
        }
        if self.asset.trim().is_empty() {
            return Err(PolicyViolation::fail("policy_invalid", "asset is empty"));
        }
        if self.allow.is_empty() {
            return Err(PolicyViolation::fail("policy_invalid", "allowlist is empty"));
        }
        if self.per_tx.0 == 0 {
            return Err(PolicyViolation::fail("policy_invalid", "per_tx is zero"));
        }
        if self.per_tx.0 > self.per_day.0 {
            return Err(PolicyViolation::fail("policy_invalid", "per_tx > per_day"));
        }
        if self.escalate_over.0 > self.per_tx.0 {
            return Err(PolicyViolation::fail("policy_invalid", "escalate_over > per_tx"));
        }
        if self.per_counterparty_day.0 == 0 {
            return Err(PolicyViolation::fail("policy_invalid", "per_counterparty_day is zero"));
        }
        for e in &self.allow {
            if e.chain.trim().is_empty() || e.to.trim().is_empty() {
                return Err(PolicyViolation::fail("policy_invalid", "allow entry has empty chain or to"));
            }
        }
        Ok(())
    }

    pub fn chains(&self) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for e in &self.allow {
            if !out.contains(&e.chain) {
                out.push(e.chain.clone());
            }
        }
        out
    }

    pub fn chain_enabled(&self, chain: &str) -> bool {
        self.allow.iter().any(|e| e.chain == chain)
    }

    pub fn vendor_allowed(&self, chain: &str, vendor: &str) -> bool {
        self.allow.iter().any(|e| e.chain == chain && e.to == vendor)
    }
}
