//! Canonicalization helpers.
//!
//! Two hashes bind the mandate's behaviour:
//! - `policy_hash`: sha256 of the JSON the contract stores. The console and
//!   MANDATE.md render the same JSON, so anyone can recompute it.
//! - `intent_hash`: sha256 of the exact (chain, amount, vendor, asset) tuple a
//!   spend is about. The attestor records it; `spend` recomputes it. A tampered
//!   amount or vendor is `attestation_mismatch`, not a new spend.

use std::collections::BTreeMap;

use near_sdk::{env, serde_json};

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(64);
    for b in env::sha256(bytes) {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

/// BTreeMap gives sorted keys and correct JSON escaping, so the attestor (JS or
/// Rust) can reproduce this byte-for-byte.
pub fn intent_hash(chain: &str, amount: u128, vendor: &str, asset: &str) -> String {
    let mut m = BTreeMap::new();
    m.insert("amount", amount.to_string());
    m.insert("asset", asset.to_string());
    m.insert("chain", chain.to_string());
    m.insert("vendor", vendor.to_string());
    let json = serde_json::to_string(&m).expect("string map serializes");
    sha256_hex(json.as_bytes())
}