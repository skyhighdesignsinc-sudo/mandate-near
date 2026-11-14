//! Unit tests: one per failure path named in SCREENER.md, plus the happy path.
//!
//! Every failure is asserted as a typed code, not as prose. If a code changes,
//! the SCREENER table is wrong and the test says so.

use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use near_sdk::{AccountId, NearToken, PublicKey};

use crate::policy::{AllowEntry, Policy};
use crate::state::Attestation;
use crate::util::intent_hash;
use crate::Contract;

const OWNER: &str = "owner.testnet";
const AGENT: &str = "agent.testnet";
const ATTESTOR: &str = "worker.testnet";
const VENDOR: &str = "0x1111111111111111111111111111111111111111";
const OTHER_VENDOR: &str = "0x2222222222222222222222222222222222222222";
const CHAIN: &str = "base_sepolia";
const ASSET: &str = "USDC";

fn acc(a: &str) -> AccountId {
    a.parse().unwrap()
}

/// Timestamps are nanoseconds, matching `env::block_timestamp()`.
fn ctx_at(predecessor: &str, deposit: u128, block_height: u64, ts: u64) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(acc(predecessor))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_height(block_height)
        .block_timestamp(ts);
    b
}

fn ctx(predecessor: &str, deposit: u128, block_height: u64) -> VMContextBuilder {
    ctx_at(predecessor, deposit, block_height, 1_700_000_000_000_000_000)
}

fn policy(require_attestation: bool) -> Policy {
    Policy {
        version: 1,
        asset: ASSET.to_string(),
        expires_at_block: 0,
        allow: vec![AllowEntry {
            chain: CHAIN.to_string(),
            to: VENDOR.to_string(),
            label: "aws".to_string(),
        }],
        per_tx: U128(50),
        per_day: U128(80),
        per_counterparty_day: U128(40),
        escalate_over: U128(20),
        require_attestation,
        attestation_code_hash: None,
    }
}

/// A contract with one funded mandate and the mandate id.
fn setup(deposit: u128, require_attestation: bool) -> (Contract, String) {
    testing_env!(ctx(OWNER, 0, 100).build());
    let mut c = Contract::new(acc(ATTESTOR));
    testing_env!(ctx(OWNER, deposit, 100).build());
    let id = c.create_mandate(acc(AGENT), policy(require_attestation));
    (c, id)
}

fn att(chain: &str, amount: u128, vendor: &str, decision: &str) -> Attestation {
    Attestation {
        signature: None,
        decision_hash: decision.to_string(),
        code_hash: "codehash".to_string(),
        quote_hash: "quotehash".to_string(),
        // `setup(.., true)` mandates carry `policy(true)`; tests for a stale
        // revision overwrite this field with the previous hash on purpose.
        policy_hash: policy(true).hash(),
        intent_hash: intent_hash(chain, amount, vendor, ASSET),
    }
}

fn spend_as(c: &mut Contract, id: &str, amount: u128, a: Attestation) -> crate::state::Authorization {
    testing_env!(ctx(AGENT, 0, 100).build());
    c.spend(
        id.to_string(),
        CHAIN.to_string(),
        U128(amount),
        ASSET.to_string(),
        VENDOR.to_string(),
        a,
    )
}

/// The daily ceiling must span blocks inside one UTC day.
///
/// Regression for D-020: `DAY_MS` was applied to a nanosecond timestamp, so a
/// "day" was 86.4 ms, every block started a new one, and the counter reset before
/// a second spend could hit it. Two spends one second apart are the same UTC day;
/// 50 + 40 crosses the 80 ceiling and the second must be refused.
#[test]
#[should_panic(expected = "PolicyViolation: per_day_exceeded")]
fn daily_ceiling_spans_blocks() {
    let mut p = policy(false);
    p.per_tx = U128(50);
    p.per_day = U128(80);
    p.per_counterparty_day = U128(1_000);
    p.escalate_over = U128(50);

    testing_env!(ctx(OWNER, 0, 100).build());
    let mut c = Contract::new(acc(ATTESTOR));
    testing_env!(ctx(OWNER, 100, 100).build());
    let id = c.create_mandate(acc(AGENT), p);

    testing_env!(ctx_at(AGENT, 0, 100, 1_700_000_000_000_000_000).build());
    let first = c.spend(
        id.clone(),
        CHAIN.to_string(),
        U128(50),
        ASSET.to_string(),
        VENDOR.to_string(),
        att(CHAIN, 50, VENDOR, "daily-1"),
    );
    assert_eq!(first.status, "authorised");

    // One second later: still the same day, but a different block.
    testing_env!(ctx_at(AGENT, 0, 101, 1_700_000_001_000_000_000).build());
    c.spend(
        id,
        CHAIN.to_string(),
        U128(40),
        ASSET.to_string(),
        VENDOR.to_string(),
        att(CHAIN, 40, VENDOR, "daily-2"),
    );
}

#[test]
fn creates_and_funds() {
    let (c, id) = setup(100, false);
    testing_env!(ctx(OWNER, 0, 100).build());
    let v = c.get_mandate(id);
    assert_eq!(v.balance.0, 100);
    assert_eq!(v.asset, ASSET);
    assert_eq!(v.chains, vec![CHAIN.to_string()]);
}

#[test]
fn create_without_deposit_is_refused() {
    testing_env!(ctx(OWNER, 0, 100).build());
    let mut c = Contract::new(acc(ATTESTOR));
    testing_env!(ctx(OWNER, 0, 100).build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.create_mandate(acc(AGENT), policy(false))
    }));
    assert!(r.is_err());
}

#[test]
fn spend_below_threshold_debits() {
    let (mut c, id) = setup(100, false);
    let out = spend_as(&mut c, &id, 10, att(CHAIN, 10, VENDOR, "d1"));
    assert_eq!(out.status, "authorised");
    testing_env!(ctx(OWNER, 0, 100).build());
    let v = c.get_mandate(id);
    assert_eq!(v.balance.0, 90);
    assert_eq!(v.spent_day.0, 10);
}

#[test]
#[should_panic(expected = "PolicyViolation: per_tx_exceeded")]
fn over_per_tx_is_refused() {
    let (mut c, id) = setup(1000, false);
    spend_as(&mut c, &id, 51, att(CHAIN, 51, VENDOR, "d1"));
}

#[test]
#[should_panic(expected = "PolicyViolation: budget_exhausted")]
fn spend_beyond_funded_balance_is_refused() {
    let (mut c, id) = setup(30, false);
    spend_as(&mut c, &id, 40, att(CHAIN, 40, VENDOR, "d1"));
}

#[test]
#[should_panic(expected = "PolicyViolation: counterparty_not_allowed")]
fn unlisted_vendor_is_refused() {
    let (mut c, id) = setup(100, false);
    testing_env!(ctx(AGENT, 0, 100).build());
    c.spend(
        id,
        CHAIN.to_string(),
        U128(5),
        ASSET.to_string(),
        OTHER_VENDOR.to_string(),
        att(CHAIN, 5, OTHER_VENDOR, "d1"),
    );
}

#[test]
#[should_panic(expected = "PolicyViolation: chain_not_enabled")]
fn unlisted_chain_is_refused() {
    let (mut c, id) = setup(100, false);
    testing_env!(ctx(AGENT, 0, 100).build());
    c.spend(
        id,
        "bitcoin".to_string(),
        U128(5),
        ASSET.to_string(),
        VENDOR.to_string(),
        att("bitcoin", 5, VENDOR, "d1"),
    );
}

#[test]
#[should_panic(expected = "PolicyViolation: attestation_required")]
fn missing_attestation_is_refused() {
    let (mut c, id) = setup(100, true);
    let mut a = att(CHAIN, 5, VENDOR, "d1");
    a.quote_hash = String::new();
    spend_as(&mut c, &id, 5, a);
}

#[test]
#[should_panic(expected = "PolicyViolation: attestation_mismatch")]
fn mutated_amount_breaks_the_attestation() {
    let (mut c, id) = setup(100, true);
    // The enclave attested 5; the agent asks for 9 with the same decision.
    let a = att(CHAIN, 5, VENDOR, "d1");
    spend_as(&mut c, &id, 9, a);
}

#[test]
#[should_panic(expected = "PolicyViolation: decision_replayed")]
fn reusing_a_decision_is_refused() {
    let (mut c, id) = setup(100, true);
    spend_as(&mut c, &id, 5, att(CHAIN, 5, VENDOR, "same"));
    spend_as(&mut c, &id, 5, att(CHAIN, 5, VENDOR, "same"));
}

#[test]
fn above_threshold_escalates_then_owner_approves() {
    let (mut c, id) = setup(100, false);
    let out = spend_as(&mut c, &id, 30, att(CHAIN, 30, VENDOR, "d1"));
    assert_eq!(out.status, "pending");

    // No debit while pending.
    testing_env!(ctx(OWNER, 0, 100).build());
    assert_eq!(c.get_mandate(id.clone()).balance.0, 100);

    let request_id = out.request_id.expect("pending has a request id");
    testing_env!(ctx(OWNER, 0, 100).build());
    let approved = c.approve(request_id);
    assert_eq!(approved.status, "authorised");
    assert_eq!(c.get_mandate(id).balance.0, 70);
}

#[test]
#[should_panic(expected = "PolicyViolation: owner_only")]
fn agent_cannot_approve_its_own_escalation() {
    let (mut c, id) = setup(100, false);
    let out = spend_as(&mut c, &id, 30, att(CHAIN, 30, VENDOR, "d1"));
    let request_id = out.request_id.unwrap();
    testing_env!(ctx(AGENT, 0, 100).build());
    c.approve(request_id);
}

#[test]
#[should_panic(expected = "PolicyViolation: mandate_suspended")]
fn suspended_mandate_refuses_spend() {
    let (mut c, id) = setup(100, false);
    testing_env!(ctx(OWNER, 0, 100).build());
    c.suspend(id.clone());
    spend_as(&mut c, &id, 5, att(CHAIN, 5, VENDOR, "d1"));
}

#[test]
#[should_panic(expected = "PolicyViolation: per_counterparty_day_exceeded")]
fn per_counterparty_cap_is_enforced() {
    let (mut c, id) = setup(1000, false);
    spend_as(&mut c, &id, 20, att(CHAIN, 20, VENDOR, "d1"));
    spend_as(&mut c, &id, 20, att(CHAIN, 20, VENDOR, "d2"));
    spend_as(&mut c, &id, 20, att(CHAIN, 20, VENDOR, "d3"));
}

#[test]
fn settle_records_the_foreign_tx() {
    let (mut c, id) = setup(100, false);
    let out = spend_as(&mut c, &id, 10, att(CHAIN, 10, VENDOR, "d1"));
    testing_env!(ctx(ATTESTOR, 0, 100).build());
    c.settle(id.clone(), out.intent_hash.clone(), "0xabc".to_string());
    assert_eq!(
        c.get_settlement(id, out.intent_hash).map(|s| s.tx_ref).as_deref(),
        Some("0xabc")
    );
}

// ------------------------------------------------- D-024: the challenge window

/// Spend 10, settle at block 100, and hand back what a contest needs.
fn settled_for_contest(c: &mut crate::Contract, id: &str) -> String {
    let out = spend_as(c, id, 10, att(CHAIN, 10, VENDOR, "contest"));
    testing_env!(ctx(ATTESTOR, 0, 100).build());
    c.settle(id.to_string(), out.intent_hash.clone(), "0xabc".to_string());
    out.intent_hash
}

#[test]
fn contest_refunds_the_balance_and_records_the_reason() {
    let (mut c, id) = setup(100, false);
    let intent = settled_for_contest(&mut c, &id);
    let before = c.get_mandate(id.clone());
    assert_eq!(before.balance.0, 90);

    testing_env!(ctx(OWNER, 0, 130).build());
    let s = c.contest(
        id.clone(),
        intent.clone(),
        "not_delivered".to_string(),
        "sha256:deadbeef".to_string(),
    );
    assert_eq!(s.amount, 10);
    assert_eq!(s.contest.as_ref().unwrap().reason, "not_delivered");
    assert_eq!(s.contest.as_ref().unwrap().at_block, 130);

    let after = c.get_mandate(id.clone());
    assert_eq!(after.balance.0, 100, "the amount returned to the balance");
    assert_eq!(after.spent_total.0, 0);

    let log = c.list_contests();
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].reason, "not_delivered");
    assert_eq!(log[0].intent_hash, intent);
}

#[test]
#[should_panic(expected = "PolicyViolation: challenge_window_closed")]
fn contest_after_the_window_is_refused() {
    let (mut c, id) = setup(100, false);
    let intent = settled_for_contest(&mut c, &id);
    // Settled at 100, window is 100 blocks, so 201 is one block too late.
    testing_env!(ctx(OWNER, 0, 201).build());
    c.contest(id, intent, "duplicate".to_string(), "sha256:x".to_string());
}

#[test]
fn the_last_block_inside_the_window_still_contests() {
    let (mut c, id) = setup(100, false);
    let intent = settled_for_contest(&mut c, &id);
    testing_env!(ctx(OWNER, 0, 200).build());
    let s = c.contest(id, intent, "duplicate".to_string(), "sha256:x".to_string());
    assert_eq!(s.amount, 10);
}

#[test]
#[should_panic(expected = "PolicyViolation: owner_only")]
fn only_the_owner_can_contest_a_settlement() {
    let (mut c, id) = setup(100, false);
    let intent = settled_for_contest(&mut c, &id);
    testing_env!(ctx(AGENT, 0, 130).build());
    c.contest(id, intent, "duplicate".to_string(), "sha256:x".to_string());
}

#[test]
#[should_panic(expected = "PolicyViolation: reason_invalid")]
fn a_contest_reason_must_be_one_of_the_four() {
    let (mut c, id) = setup(100, false);
    let intent = settled_for_contest(&mut c, &id);
    testing_env!(ctx(OWNER, 0, 130).build());
    c.contest(id, intent, "i_changed_my_mind".to_string(), "sha256:x".to_string());
}

#[test]
#[should_panic(expected = "PolicyViolation: already_contested")]
fn a_settlement_can_be_contested_once() {
    let (mut c, id) = setup(100, false);
    let intent = settled_for_contest(&mut c, &id);
    testing_env!(ctx(OWNER, 0, 130).build());
    c.contest(id.clone(), intent.clone(), "duplicate".to_string(), "sha256:x".to_string());
    c.contest(id, intent, "duplicate".to_string(), "sha256:x".to_string());
}

#[test]
fn settle_refuses_an_intent_the_contract_never_authorised() {
    let (mut c, id) = setup(100, false);
    testing_env!(ctx(ATTESTOR, 0, 100).build());
    // `tx` references are asserted by the attestor, but the intent must be ours.
    let err = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.settle(id, "not-an-intent".to_string(), "0xabc".to_string());
    }));
    assert!(err.is_err(), "a settlement for an unknown intent must be refused");
}

#[test]
#[should_panic(expected = "PolicyViolation: attestor_only")]
fn only_the_attestor_can_settle() {
    let (mut c, id) = setup(100, false);
    let out = spend_as(&mut c, &id, 10, att(CHAIN, 10, VENDOR, "d1"));
    testing_env!(ctx(AGENT, 0, 100).build());
    c.settle(id, out.intent_hash, "0xabc".to_string());
}

#[test]
fn stats_count_authorisations() {
    let (mut c, id) = setup(100, false);
    spend_as(&mut c, &id, 10, att(CHAIN, 10, VENDOR, "d1"));
    testing_env!(ctx(OWNER, 0, 100).build());
    let s = c.stats();
    assert_eq!(s.total_mandates, 1);
    assert_eq!(s.total_authorised.0, 10);
    assert_eq!(s.total_settled, 0);
}

// ---------------------------------------------------------------- views added for the console

#[test]
fn lists_every_mandate_and_pending_request() {
    let (mut c, id) = setup(100, false);
    testing_env!(ctx(OWNER, 20, 100).build());
    let second = c.create_mandate(acc(AGENT), policy(false));
    assert_eq!(c.list_mandates().len(), 2);

    testing_env!(ctx(AGENT, 0, 100).build());
    let a = c.spend(
        id.clone(),
        CHAIN.to_string(),
        U128(30),
        ASSET.to_string(),
        VENDOR.to_string(),
        att(CHAIN, 30, VENDOR, "d-list"),
    );
    assert_eq!(a.status, "pending");

    let queue = c.list_pending();
    assert_eq!(queue.len(), 1);
    assert_eq!(queue[0].mandate_id, id);
    assert_eq!(queue[0].amount, 30);
    assert_eq!(c.get_mandate(second).balance.0, 20);
}

#[test]
fn update_policy_changes_the_hash_and_binds_the_next_spend() {
    let (mut c, id) = setup(100, false);
    let before = c.get_mandate(id.clone()).policy_hash;

    let mut tighter = policy(false);
    tighter.per_tx = U128(10);
    tighter.per_day = U128(10);
    tighter.per_counterparty_day = U128(10);
    tighter.escalate_over = U128(10);

    testing_env!(ctx(OWNER, 0, 100).build());
    let after = c.update_policy(id.clone(), tighter);
    assert_ne!(before, after);
    assert_eq!(c.get_mandate(id.clone()).policy_hash, after);
    assert_eq!(c.get_mandate(id.clone()).per_tx.0, 10);

    // 15 was legal under the old per_tx of 50 and is refused under the new one.
    testing_env!(ctx(AGENT, 0, 100).build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.spend(
            id.clone(),
            CHAIN.to_string(),
            U128(15),
            ASSET.to_string(),
            VENDOR.to_string(),
            att(CHAIN, 15, VENDOR, "d-update"),
        )
    }));
    let msg = r.unwrap_err();
    let text = msg
        .downcast_ref::<String>()
        .cloned()
        .or_else(|| msg.downcast_ref::<&str>().map(|s| s.to_string()))
        .unwrap_or_default();
    assert!(text.contains("per_tx_exceeded"), "got: {text}");
}

#[test]
#[should_panic(expected = "PolicyViolation: owner_only")]
fn update_policy_is_owner_only() {
    let (mut c, id) = setup(100, false);
    testing_env!(ctx(AGENT, 0, 100).build());
    c.update_policy(id, policy(false));
}

// ---------------------------------------------------------------- policy revisions

#[test]
fn policy_history_records_every_revision() {
    let (mut c, id) = setup(100, false);
    testing_env!(ctx(OWNER, 0, 100).build());
    assert_eq!(c.get_policy_history(id.clone()).len(), 1);
    assert_eq!(c.get_mandate(id.clone()).policy_rev, 1);

    let mut tighter = policy(false);
    tighter.per_tx = U128(10);
    tighter.per_day = U128(10);
    tighter.per_counterparty_day = U128(10);
    tighter.escalate_over = U128(10);
    let hash = c.update_policy(id.clone(), tighter);

    let view = c.get_mandate(id.clone());
    assert_eq!(view.policy_rev, 2);
    assert_eq!(view.policy_hash, hash);

    let history = c.get_policy_history(id);
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].rev, 1);
    assert_eq!(history[1].rev, 2);
    assert_eq!(history[1].hash, hash);
    assert_eq!(history[1].per_tx.0, 10);
    assert_eq!(history[1].at_block, 100);
    assert_ne!(history[0].hash, history[1].hash);
}

#[test]
fn re_applying_the_same_policy_adds_no_revision() {
    let (mut c, id) = setup(100, false);
    testing_env!(ctx(OWNER, 0, 100).build());
    let hash = c.get_mandate(id.clone()).policy_hash;
    let returned = c.update_policy(id.clone(), policy(false));
    assert_eq!(returned, hash);
    assert_eq!(c.get_mandate(id.clone()).policy_rev, 1);
    assert_eq!(c.get_policy_history(id).len(), 1);
}

#[test]
#[should_panic(expected = "PolicyViolation: policy_changed")]
fn stale_attestation_after_policy_change_is_refused() {
    let (mut c, id) = setup(100, true);
    testing_env!(ctx(OWNER, 0, 100).build());
    let old = c.get_mandate(id.clone()).policy_hash;

    // per_tx stays 50, so 5 is inside every limit of the new policy: only the
    // decision is stale, which is exactly the case this refuses.
    let mut tighter = policy(true);
    tighter.escalate_over = U128(15);
    c.update_policy(id.clone(), tighter);

    let mut a = att(CHAIN, 5, VENDOR, "d-stale");
    a.policy_hash = old;
    spend_as(&mut c, &id, 5, a);
}

#[test]
#[should_panic(expected = "PolicyViolation: policy_changed")]
fn escalation_raised_under_an_older_policy_cannot_be_approved() {
    let (mut c, id) = setup(100, true);
    let out = spend_as(&mut c, &id, 30, att(CHAIN, 30, VENDOR, "d-esc"));
    assert_eq!(out.status, "pending");

    let mut tighter = policy(true);
    tighter.escalate_over = U128(15);
    testing_env!(ctx(OWNER, 0, 100).build());
    c.update_policy(id.clone(), tighter);
    c.approve(out.request_id.unwrap());
}

#[test]
fn authorization_names_the_revision_it_was_decided_under() {
    let (mut c, id) = setup(100, true);
    let out = spend_as(&mut c, &id, 5, att(CHAIN, 5, VENDOR, "d-rev"));
    testing_env!(ctx(OWNER, 0, 100).build());
    let view = c.get_mandate(id.clone());
    assert_eq!(out.policy_hash, view.policy_hash);
    assert_eq!(view.policy_rev, 1);
    assert_eq!(c.get_policy_history(id).len(), 1);
}

#[test]
#[should_panic(expected = "PolicyViolation: policy_invalid")]
fn update_policy_validates_the_new_policy() {
    let (mut c, id) = setup(100, false);
    let mut broken = policy(false);
    broken.allow.clear();
    testing_env!(ctx(OWNER, 0, 100).build());
    c.update_policy(id, broken);
}

/// The feature the differential audit found in none of the eleven comparable
/// vaults: revocation removes the key from the account, not only the policy.
/// The assertion is on the created receipt, because "the key cannot sign any
/// more" is a promise action, not a state field.
#[test]
fn revoke_key_suspends_and_deletes_the_key_in_one_receipt() {
    let (mut c, id) = setup(100, false);
    // 32 zero bytes, base58-encoded, is a parseable ed25519 public key.
    let key_str = format!("ed25519:{}", "1".repeat(32));
    let key: PublicKey = key_str.parse().unwrap();

    testing_env!(ctx(OWNER, 0, 101).build());
    c.revoke_key(id.clone(), key);

    assert!(c.get_mandate(id).suspended, "revoke must suspend as well as delete");

    // The receipt records `near_crypto`'s key type, so compare its textual form
    // rather than forcing a trait impl that does not exist across the crates.
    let receipts = near_sdk::test_utils::get_created_receipts();
    let deleted = receipts.iter().flat_map(|r| r.actions.iter()).any(|a| {
        matches!(
            a,
            near_sdk::mock::MockAction::DeleteKey { public_key, .. }
                if public_key.to_string() == key_str
        )
    });
    assert!(deleted, "no DeleteKey action was created: the key would still sign");
}

// ------------------------------------------------- the caller is the agent

#[test]
#[should_panic(expected = "PolicyViolation: unauthorized")]
fn only_the_named_agent_can_request_a_spend() {
    let (mut c, id) = setup(100, false);
    // The owner funds and configures the mandate, but the right to *ask* belongs
    // to the agent account alone. Without this check any account could burn the
    // day's allowance up to the caps.
    testing_env!(ctx(OWNER, 0, 100).build());
    c.spend(
        id,
        CHAIN.to_string(),
        U128(5),
        ASSET.to_string(),
        VENDOR.to_string(),
        att(CHAIN, 5, VENDOR, "d1"),
    );
}

// -------------------------------------- M-01/M-04/M-07: the 2026-11-14 review

#[test]
fn a_contest_does_not_free_the_daily_ceiling() {
    let (mut c, id) = setup(100, false);
    let intent = settled_for_contest(&mut c, &id);
    testing_env!(ctx(OWNER, 0, 130).build());
    c.contest(
        id.clone(),
        intent,
        "not_delivered".to_string(),
        "sha256:deadbeef".to_string(),
    );

    let after = c.get_mandate(id);
    assert_eq!(after.balance.0, 100, "the money returns to the balance");
    assert_eq!(
        after.spent_day.0, 10,
        "the day's allowance stays spent: a contest must not refill a ceiling"
    );
}

#[test]
fn a_mandate_owner_who_is_not_the_contract_owner_cannot_delete_account_keys() {
    let (mut c, _) = setup(100, false);
    // A stranger creates their own mandate. `create_mandate` is permissionless,
    // so this is the first half of the attack M-01 describes.
    testing_env!(ctx(AGENT, 100, 100).build());
    let theirs = c.create_mandate(acc(AGENT), policy(false));

    let key_str = format!("ed25519:{}", "1".repeat(32));
    let key: PublicKey = key_str.parse().unwrap();
    testing_env!(ctx(AGENT, 0, 101).build());
    c.revoke_key(theirs.clone(), key);

    assert!(
        c.get_mandate(theirs).suspended,
        "their own mandate is still suspended"
    );
    let receipts = near_sdk::test_utils::get_created_receipts();
    let deleted = receipts.iter().flat_map(|r| r.actions.iter()).any(|a| {
        matches!(a, near_sdk::mock::MockAction::DeleteKey { .. })
    });
    assert!(
        !deleted,
        "a mandate owner who is not the contract owner must not delete the account's keys"
    );
}

#[test]
#[should_panic(expected = "PolicyViolation: per_counterparty_day_exceeded")]
fn approvals_cannot_walk_past_the_counterparty_ceiling() {
    // Both requests were inside every limit when raised; approving the queue adds
    // them to the same day and must re-check what the sum now exceeds (M-04).
    let (mut c, id) = setup(200, false);
    let a = spend_as(&mut c, &id, 25, att(CHAIN, 25, VENDOR, "a"));
    let b = spend_as(&mut c, &id, 20, att(CHAIN, 20, VENDOR, "b"));

    testing_env!(ctx(OWNER, 0, 100).build());
    c.approve(a.request_id.expect("pending has a request id"));
    testing_env!(ctx(OWNER, 0, 100).build());
    c.approve(b.request_id.expect("pending has a request id"));
}
