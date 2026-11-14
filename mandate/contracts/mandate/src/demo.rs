//! The deterministic replay shared by `make demo`, `tools/verify.mjs` and the console.
//!
//! One scenario, twelve events, each one a real call on the real contract inside
//! near-sdk's test VM. The JSON this writes is the console's only data source in
//! replay mode: every amount, hash and refusal code the UI shows was produced
//! here, by the contract, and not by the UI.
//!
//! Determinism is a feature, not an accident. Block height and timestamp are
//! fixed, amounts are integers, and nothing reads the wall clock, so two runs on
//! two machines produce byte-identical JSON. `make demo` hashes the output and
//! fails when it changes, which is how a judge knows the numbers on screen were
//! not typed by hand.
//!
//! Run it through `make demo`; a bare `cargo test` runs it too, harmlessly, and
//! only writes the snapshot when `MANDATE_DEMO_OUT` is set.

use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use near_sdk::{serde_json, AccountId, NearToken};

use crate::policy::{AllowEntry, Policy};
use crate::state::{Attestation, Authorization};
use crate::util::intent_hash;
use crate::Contract;

const OWNER: &str = "owner.testnet";
const AGENT: &str = "agent.testnet";
const ATTESTOR: &str = "worker.testnet";
const CONTRACT: &str = "mandate.testnet";

const VENDOR: &str = "0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901";
const OTHER_VENDOR: &str = "0x1111111111111111111111111111111111111111";
const ROGUE_VENDOR: &str = "0xdeadbeef00000000000000000000000000000001";
const CHAIN: &str = "base_sepolia";
const ASSET: &str = "USDC";
const DECIMALS: u32 = 6;

/// Measurement of the code allowed to decide. Compare, do not trust.
const CODE_HASH: &str =
    "sha256:9f3a7c1e5b0d2468ac9e71f3d5b8c0a2e4f60719283b4c5d6e7f8091a2b3c4d5";
const QUOTE_HASH: &str =
    "sha256:1f0c9b8a7d6e5f40312a95c8b7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8";
const TX_REF: &str = "solana:5Vf3kQp8sT2mR9wLc6bY4nH1jD7xZa0eUq3BvKpWs4Lt";

/// 1 USDC in the asset's smallest unit. Amounts are integers everywhere.
const USDC: u128 = 1_000_000;

fn acc(a: &str) -> AccountId {
    a.parse().unwrap()
}

fn ctx(predecessor: &str, deposit: u128, height: u64) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(acc(predecessor))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_height(height)
        .block_timestamp(1_700_000_000_000_000_000)
        .account_balance(NearToken::from_near(100));
    b
}

fn policy() -> Policy {
    Policy {
        version: 1,
        asset: ASSET.to_string(),
        expires_at_block: 0,
        allow: vec![
            AllowEntry {
                chain: CHAIN.to_string(),
                to: VENDOR.to_string(),
                label: "openrouter".to_string(),
            },
            AllowEntry {
                chain: CHAIN.to_string(),
                to: OTHER_VENDOR.to_string(),
                label: "aws".to_string(),
            },
        ],
        per_tx: U128(50 * USDC),
        per_day: U128(120 * USDC),
        per_counterparty_day: U128(40 * USDC),
        escalate_over: U128(20 * USDC),
        require_attestation: true,
        attestation_code_hash: Some(CODE_HASH.to_string()),
    }
}

fn decision(n: u64) -> String {
    format!("sha256:{:064x}", 0xa0u64 + n)
}

fn att(amount: u128, vendor: &str, n: u64, policy_hash: &str) -> Attestation {
    Attestation {
        decision_hash: decision(n),
        code_hash: CODE_HASH.to_string(),
        quote_hash: QUOTE_HASH.to_string(),
        policy_hash: policy_hash.to_string(),
        intent_hash: intent_hash(CHAIN, amount, vendor, ASSET),
    }
}

/// The refusal a panicking call produced, as the code a judge can grep.
fn code_from(err: Box<dyn std::any::Any + Send>) -> String {
    let msg = if let Some(s) = err.downcast_ref::<String>() {
        s.clone()
    } else if let Some(s) = err.downcast_ref::<&str>() {
        (*s).to_string()
    } else {
        "unknown".to_string()
    };
    match msg.find("PolicyViolation: ") {
        Some(i) => msg[i + "PolicyViolation: ".len()..]
            .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
            .next()
            .unwrap_or("unknown")
            .to_string(),
        None => msg,
    }
}

/// Run a call that must fail, and return its code. A call that succeeds is a
/// scenario bug, so it panics loudly rather than being recorded as a refusal.
fn refuse<F: FnOnce()>(f: F) -> String {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(_) => panic!("demo: expected a typed refusal, the call succeeded"),
        Err(e) => code_from(e),
    }
}

fn views(c: &Contract) -> serde_json::Value {
    // The policy history travels with every step, so the console can show which
    // revision each event was judged under without a second data source.
    let history = match c.list_mandates().first() {
        Some(m) => c.get_policy_history(m.id.clone()),
        None => Vec::new(),
    };
    serde_json::json!({
        "mandates": c.list_mandates(),
        "pending": c.list_pending(),
        "stats": c.stats(),
        "held": c.held(),
        "policy_history": history,
    })
}

#[allow(clippy::too_many_arguments)]
fn push(
    steps: &mut Vec<serde_json::Value>,
    index: u32,
    label: &str,
    detail: &str,
    kind: &str,
    code: Option<&str>,
    auth: Option<&Authorization>,
    c: &Contract,
) {
    let mut v = serde_json::json!({
        "index": index,
        "label": label,
        "detail": detail,
        "kind": kind,
        "views": views(c),
    });
    if let Some(code) = code {
        v["code"] = serde_json::json!(code);
    }
    if let Some(a) = auth {
        v["authorization"] = serde_json::to_value(a).unwrap();
    }
    steps.push(v);
}

#[test]
fn replay_produces_a_deterministic_snapshot() {
    // The scenario provokes refusals on purpose; their panic messages are the
    // product here, so keep them out of the terminal.
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));

    testing_env!(ctx(OWNER, 0, 4_120_000).build());
    let mut c = Contract::new(acc(ATTESTOR));
    testing_env!(ctx(OWNER, 100 * USDC, 4_120_001).build());
    let mandate = c.create_mandate(acc(AGENT), policy());
    // Revision 1. Every decision in events 1–12 names this hash.
    let ph1 = c.list_mandates()[0].policy_hash.clone();
    let initial = views(&c);

    let mut steps: Vec<serde_json::Value> = Vec::new();

    // 1 — a spend under every limit, debited in this receipt.
    testing_env!(ctx(AGENT, 0, 4_120_002).build());
    let a1 = c.spend(
        mandate.clone(),
        CHAIN.to_string(),
        U128(12 * USDC),
        ASSET.to_string(),
        VENDOR.to_string(),
        att(12 * USDC, VENDOR, 1, &ph1),
    );
    push(
        &mut steps,
        1,
        "Authorised",
        "12.00 USDC to openrouter, below the 20.00 escalation threshold",
        "authorised",
        None,
        Some(&a1),
        &c,
    );

    // 2 — the per-counterparty ceiling, not the per-transaction one.
    let code = refuse(|| {
        c.spend(
            mandate.clone(),
            CHAIN.to_string(),
            U128(45 * USDC),
            ASSET.to_string(),
            VENDOR.to_string(),
            att(45 * USDC, VENDOR, 2, &ph1),
        );
    });
    assert_eq!(code, "per_counterparty_day_exceeded");
    push(
        &mut steps,
        2,
        "Refused",
        "45.00 would make 57.00 at one counterparty today, above the 40.00 ceiling",
        "refused",
        Some(&code),
        None,
        &c,
    );

    // 3 — above the threshold, so it becomes a request instead of a debit.
    testing_env!(ctx(AGENT, 0, 4_120_004).build());
    let a3 = c.spend(
        mandate.clone(),
        CHAIN.to_string(),
        U128(21 * USDC),
        ASSET.to_string(),
        VENDOR.to_string(),
        att(21 * USDC, VENDOR, 3, &ph1),
    );
    let escalated_intent = a3.intent_hash.clone();
    push(
        &mut steps,
        3,
        "Escalated",
        "21.00 is above the 20.00 threshold: the contract stores a pending request",
        "escalated",
        None,
        Some(&a3),
        &c,
    );

    // 4 — the owner answers; only now is the balance debited.
    testing_env!(ctx(OWNER, 0, 4_120_005).build());
    let a4 = c.approve(a3.request_id.clone().unwrap());
    push(
        &mut steps,
        4,
        "Approved",
        "The owner approved the request; 21.00 USDC leaves the balance here",
        "authorised",
        None,
        Some(&a4),
        &c,
    );

    // 5 — a second counterparty, to show the ceilings are per vendor.
    testing_env!(ctx(AGENT, 0, 4_120_006).build());
    let a5 = c.spend(
        mandate.clone(),
        CHAIN.to_string(),
        U128(6 * USDC),
        ASSET.to_string(),
        OTHER_VENDOR.to_string(),
        att(6 * USDC, OTHER_VENDOR, 5, &ph1),
    );
    push(
        &mut steps,
        5,
        "Authorised",
        "6.00 USDC to aws; openrouter's spend does not count against aws",
        "authorised",
        None,
        Some(&a5),
        &c,
    );

    // 6 — a vendor that is not on the allowlist for this chain.
    let code = refuse(|| {
        c.spend(
            mandate.clone(),
            CHAIN.to_string(),
            U128(5 * USDC),
            ASSET.to_string(),
            ROGUE_VENDOR.to_string(),
            att(5 * USDC, ROGUE_VENDOR, 6, &ph1),
        );
    });
    assert_eq!(code, "counterparty_not_allowed");
    push(
        &mut steps,
        6,
        "Refused",
        "The vendor is absent from the allowlist, so the code is typed and final",
        "refused",
        Some(&code),
        None,
        &c,
    );

    // 7 — the attestation describes an 8.00 spend; the call asks for 7.00.
    let code = refuse(|| {
        c.spend(
            mandate.clone(),
            CHAIN.to_string(),
            U128(7 * USDC),
            ASSET.to_string(),
            VENDOR.to_string(),
            att(8 * USDC, VENDOR, 7, &ph1),
        );
    });
    assert_eq!(code, "attestation_mismatch");
    push(
        &mut steps,
        7,
        "Refused",
        "The attested intent says 8.00, the call asks for 7.00: the hashes part company",
        "refused",
        Some(&code),
        None,
        &c,
    );

    // 8 — the same decision cannot authorise a second spend.
    let code = refuse(|| {
        c.spend(
            mandate.clone(),
            CHAIN.to_string(),
            U128(5 * USDC),
            ASSET.to_string(),
            VENDOR.to_string(),
            att(5 * USDC, VENDOR, 1, &ph1),
        );
    });
    assert_eq!(code, "decision_replayed");
    push(
        &mut steps,
        8,
        "Refused",
        "That decision hash already authorised step 1; a decision is good once",
        "refused",
        Some(&code),
        None,
        &c,
    );

    // 9 — suspension is checked before anything else, including the attestation.
    testing_env!(ctx(OWNER, 0, 4_120_009).build());
    c.suspend(mandate.clone());
    testing_env!(ctx(AGENT, 0, 4_120_010).build());
    let code = refuse(|| {
        c.spend(
            mandate.clone(),
            CHAIN.to_string(),
            U128(5 * USDC),
            ASSET.to_string(),
            VENDOR.to_string(),
            att(5 * USDC, VENDOR, 9, &ph1),
        );
    });
    assert_eq!(code, "mandate_suspended");
    push(
        &mut steps,
        9,
        "Refused",
        "The owner suspended the mandate; this is the kill switch, in one call",
        "refused",
        Some(&code),
        None,
        &c,
    );

    // 10 — resuming restores the same mandate, not a new one.
    testing_env!(ctx(OWNER, 0, 4_120_011).build());
    c.resume(mandate.clone());
    push(
        &mut steps,
        10,
        "Resumed",
        "Suspension is a flag, so resuming needs no re-funding and no new key",
        "resumed",
        None,
        None,
        &c,
    );

    // 11 — the settled foreign transaction reference, attestor only.
    testing_env!(ctx(ATTESTOR, 0, 4_120_012).build());
    c.settle(mandate.clone(), escalated_intent.clone(), TX_REF.to_string());
    push(
        &mut steps,
        11,
        "Settled",
        "The attestor recorded the Solana transaction against the intent hash",
        "settled",
        None,
        None,
        &c,
    );

    // 12 — the guard that stops a foreign tx being claimed twice.
    testing_env!(ctx(ATTESTOR, 0, 4_120_013).build());
    let code = refuse(|| c.settle(mandate.clone(), escalated_intent.clone(), TX_REF.to_string()));
    assert_eq!(code, "decision_replayed");
    push(
        &mut steps,
        12,
        "Refused",
        "Settling the same intent twice is refused: one intent, one foreign tx",
        "refused",
        Some(&code),
        None,
        &c,
    );

    // 13 — the owner tightens the policy. Three limits move; the revision moves.
    testing_env!(ctx(OWNER, 0, 4_120_014).build());
    let mut tighter = policy();
    tighter.per_tx = U128(30 * USDC);
    tighter.per_day = U128(90 * USDC);
    tighter.per_counterparty_day = U128(25 * USDC);
    tighter.escalate_over = U128(15 * USDC);
    // Keep a copy: the snapshot must serialise the policy that is in force at
    // the end of the run, not the one it started with, or the hash check below
    // compares two different documents.
    let ph2 = c.update_policy(mandate.clone(), tighter.clone());
    assert_ne!(ph1, ph2, "a changed policy must have a new hash");
    push(
        &mut steps,
        13,
        "Re-policied",
        "Per-transaction 30.00, per counterparty 25.00: the hash changes and the revision is 2",
        "repolicy",
        None,
        None,
        &c,
    );

    // 14 — a decision attested under revision 1 is stale under revision 2.
    testing_env!(ctx(AGENT, 0, 4_120_015).build());
    let code = refuse(|| {
        c.spend(
            mandate.clone(),
            CHAIN.to_string(),
            U128(5 * USDC),
            ASSET.to_string(),
            OTHER_VENDOR.to_string(),
            att(5 * USDC, OTHER_VENDOR, 13, &ph1),
        );
    });
    assert_eq!(code, "policy_changed");
    push(
        &mut steps,
        14,
        "Refused",
        "5.00 is inside every new limit, but the decision was attested under revision 1",
        "refused",
        Some(&code),
        None,
        &c,
    );

    // 15 — the same spend, decided again under the current revision.
    testing_env!(ctx(AGENT, 0, 4_120_016).build());
    let a15 = c.spend(
        mandate.clone(),
        CHAIN.to_string(),
        U128(5 * USDC),
        ASSET.to_string(),
        OTHER_VENDOR.to_string(),
        att(5 * USDC, OTHER_VENDOR, 14, &ph2),
    );
    push(
        &mut steps,
        15,
        "Authorised",
        "Re-attested under revision 2: same amount, a new decision, accepted",
        "authorised",
        None,
        Some(&a15),
        &c,
    );

    let final_views = views(&c);
    let snapshot = serde_json::json!({
        "schema": 1,
        "network": "testnet",
        "contract": CONTRACT,
        "attestor": ATTESTOR,
        "owner": OWNER,
        "agent": AGENT,
        "asset": ASSET,
        "decimals": DECIMALS,
        "mandateId": mandate,
        "policyJson": serde_json::to_string(&tighter).unwrap(),
        "policyHash": match final_views["mandates"].get(0) {
            Some(m) => m["policy_hash"].clone(),
            None => serde_json::Value::Null,
        },
        "policyRevisions": final_views["policy_history"].clone(),
        "attestationCodeHash": CODE_HASH,
        "initial": initial,
        "steps": steps,
        "final": final_views,
    });

    let text = serde_json::to_string_pretty(&snapshot).unwrap();

    if let Ok(path) = std::env::var("MANDATE_DEMO_OUT") {
        std::fs::write(&path, format!("{text}\n")).expect("write snapshot");
    }

    // A compact transcript for `make demo`; the JSON above is for the console.
    println!("\n  #  event                 kind        code");
    println!("  -- --------------------- ----------- -----------------------------");
    for s in snapshot["steps"].as_array().unwrap() {
        println!(
            "  {:>2} {:<21} {:<11} {}",
            s["index"].as_u64().unwrap(),
            s["label"].as_str().unwrap(),
            s["kind"].as_str().unwrap(),
            s["code"].as_str().unwrap_or("—"),
        );
    }
    println!();

    std::panic::set_hook(previous);
}
