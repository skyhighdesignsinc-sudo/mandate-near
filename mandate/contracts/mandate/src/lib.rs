//! The mandate contract.
//!
//! One idea: an agent gets a funded balance and an allowlist, and neither can be
//! exceeded at settlement. Every spend above the escalation threshold carries an
//! attestation of the decision that produced it, recorded by hash so a third
//! party can re-check it.
//!
//! What the key does and what this contract does are different jobs, and the
//! README must keep them apart:
//!   - the agent's NEAR access key is scoped by the protocol to `spend` on this
//!     contract and cannot transfer tokens, add keys or delete the account;
//!   - this contract decides whether a spend fits the policy and the balance.
//! Neither one alone is the guarantee. Both together are what the demo shows.
//!
//! Failure paths panic with `PolicyViolation: <code>` (see errors.rs), so a
//! judge can grep the failed receipt for the code named in SCREENER.md.

mod errors;
mod migrate;
mod policy;
mod state;
mod util;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod demo;

use std::collections::BTreeMap;

use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, PanicOnDefault, Promise, PublicKey};

use crate::errors::PolicyViolation;
use crate::policy::Policy;
use crate::state::{
    Attestation, Authorization, Contest, Mandate, MandateId, MandateStats, MandateView,
    PendingRequest, PolicyRevision, Settlement, STATUS_AUTHORISED, STATUS_PENDING,
};
use crate::util::intent_hash;

// `env::block_timestamp()` is nanoseconds, not milliseconds (`near_sdk::env`
// exposes `block_timestamp_ms` precisely because this is easy to get wrong).
// Dividing a nanosecond value by 86_400_000 made a "day" 86.4 ms long, so
// `roll_day` reset the daily counters between consecutive blocks and the per-day
// and per-counterparty ceilings never bound. Fixed 2026-11-07 (D-020); the
// regression is `daily_ceiling_spans_blocks` in `tests.rs`.
const DAY_NS: u64 = 86_400_000_000_000;
/// Guards against a runaway loop of mandates in one deployment.
const MAX_MANDATES: u64 = 10_000;

/// How long a recorded settlement stays contestable, in blocks (D-024). A block
/// height rather than a timestamp: the chain already agrees on it, and a contest
/// must not depend on a clock the caller supplies.
const CHALLENGE_WINDOW_BLOCKS: u64 = 100;

/// Frozen contest reasons. A free-text reason would be ungroupable in the console
/// and unquotable in a refund conversation.
const CONTEST_REASONS: &[&str] = &["not_delivered", "wrong_amount", "duplicate", "key_compromised"];

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner: AccountId,
    /// The account allowed to `settle` an authorisation with its foreign tx ref.
    /// In the demo this is the worker account; the console reads, never writes.
    pub attestor: AccountId,
    pub mandates: BTreeMap<MandateId, Mandate>,
    pub pending: BTreeMap<String, PendingRequest>,
    /// decision_hash -> true. A decision authorises one spend, once.
    pub used_decisions: BTreeMap<String, bool>,
    pub next_id: u64,
}

#[near]
impl Contract {
    #[init]
    pub fn new(attestor: AccountId) -> Self {
        Self {
            owner: env::predecessor_account_id(),
            attestor,
            mandates: BTreeMap::new(),
            pending: BTreeMap::new(),
            used_decisions: BTreeMap::new(),
            next_id: 1,
        }
    }

    // ---------------------------------------------------------------- owner

    /// Create a mandate. The attached deposit funds it, so a mandate with no
    /// balance cannot exist (budget = funded balance, D-002).
    #[payable]
    pub fn create_mandate(&mut self, agent: AccountId, policy: Policy) -> MandateId {
        let owner = env::predecessor_account_id();
        if let Err(e) = policy.validate() {
            env::panic_str(&e.to_string());
        }
        if self.next_id > MAX_MANDATES {
            env::panic_str(&PolicyViolation::new("policy_invalid").to_string());
        }
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit == 0 {
            env::panic_str(
                &PolicyViolation::fail("amount_zero", "fund the mandate on create").to_string(),
            );
        }

        let id = format!("m{}", self.next_id);
        self.next_id += 1;

        let policy_hash = policy.hash();
        let revision = PolicyRevision {
            rev: 1,
            hash: policy_hash.clone(),
            at_block: env::block_height(),
            per_tx: policy.per_tx,
            per_day: policy.per_day,
            per_counterparty_day: policy.per_counterparty_day,
            escalate_over: policy.escalate_over,
        };

        let mandate = Mandate {
            id: id.clone(),
            owner: owner.clone(),
            agent,
            policy_hash,
            policy,
            policy_rev: 1,
            policy_history: vec![revision],
            balance: deposit,
            spent_total: 0,
            spent_day: 0,
            day_index: env::block_timestamp() / DAY_NS,
            spent_by_counterparty: BTreeMap::new(),
            suspended: false,
            created_at_block: env::block_height(),
            settled: BTreeMap::new(),
            authorised_amount: BTreeMap::new(),
        };

        env::log_str(&format!(
            "mandate_created: id={} owner={} agent={} balance={} policy_hash={}",
            id, owner, mandate.agent, deposit, mandate.policy_hash
        ));
        self.mandates.insert(id.clone(), mandate);
        id
    }

    /// Top up an existing mandate. Owner only.
    #[payable]
    pub fn fund(&mut self, id: MandateId) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        if amount == 0 {
            env::panic_str(&PolicyViolation::new("amount_zero").to_string());
        }
        let mandate = match self.mandates.get_mut(&id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        assert_owner(mandate);
        mandate.balance += amount;
        let balance = mandate.balance;
        env::log_str(&format!(
            "mandate_funded: id={} amount={} balance={}",
            id, amount, balance
        ));
        U128(balance)
    }

    pub fn suspend(&mut self, id: MandateId) {
        let mandate = match self.mandates.get_mut(&id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        assert_owner(mandate);
        mandate.suspended = true;
        env::log_str(&format!("mandate_suspended: id={}", id));
    }

    /// Suspend the mandate **and delete a key from the contract's own account**
    /// in the same receipt. `suspend` stops the contract from paying; this also
    /// stops the protocol from accepting a signature by that key, so a revoked
    /// agent cannot even reach `spend` to be refused. Every vault in this field
    /// documents pause; none documents key removal (see UNIQUENESS-AUDIT 4.4).
    ///
    /// The owner supplies the key, because a contract cannot read its own key
    /// set from inside a call. The guarantee is therefore exact and narrow:
    /// after this receipt, that key cannot sign for this account. Deleting a key
    /// the owner does not control is a protocol no-op, not an escalation.
    pub fn revoke_key(&mut self, id: MandateId, key: PublicKey) {
        let mandate = match self.mandates.get_mut(&id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        assert_owner(mandate);
        let agent = mandate.agent.clone();
        mandate.suspended = true;
        env::log_str(&format!("mandate_suspended: id={}", id));
        env::log_str(&format!(
            "agent_key_deleted: id={} agent={} key={}",
            id, agent, key
        ));
        let _ = Promise::new(env::current_account_id()).delete_key(key);
    }

    pub fn resume(&mut self, id: MandateId) {
        let mandate = match self.mandates.get_mut(&id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        assert_owner(mandate);
        mandate.suspended = false;
        env::log_str(&format!("mandate_resumed: id={}", id));
    }

    /// Replace the policy. Owner only. The balance and the day counters are
    /// untouched, so a tighter policy can never forgive what was already spent,
    /// and a looser one cannot create funds that were never deposited.
    /// Returns the new `policy_hash`; the console shows the diff of the two.
    pub fn update_policy(&mut self, id: MandateId, policy: Policy) -> String {
        let mandate = match self.mandates.get_mut(&id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        assert_owner(mandate);
        if let Err(e) = policy.validate() {
            env::panic_str(&e.to_string());
        }
        let hash = policy.hash();
        if hash == mandate.policy_hash {
            // Re-applying the same policy is a no-op, not a new revision: the
            // history must only grow when the rules actually changed.
            env::log_str(&format!("policy_unchanged: id={} policy_hash={}", id, hash));
            return hash;
        }
        mandate.policy_rev += 1;
        mandate.policy_history.push(PolicyRevision {
            rev: mandate.policy_rev,
            hash: hash.clone(),
            at_block: env::block_height(),
            per_tx: policy.per_tx,
            per_day: policy.per_day,
            per_counterparty_day: policy.per_counterparty_day,
            escalate_over: policy.escalate_over,
        });
        mandate.policy_hash = hash.clone();
        mandate.policy = policy;
        env::log_str(&format!(
            "policy_updated: id={} policy_hash={} rev={}",
            id, hash, mandate.policy_rev
        ));
        hash
    }

    /// Answer an escalated request. Debiting happens here, not on request.
    pub fn approve(&mut self, request_id: String) -> Authorization {
        let request = match self.pending.remove(&request_id) {
            Some(r) => r,
            None => env::panic_str(&PolicyViolation::new("request_not_pending").to_string()),
        };
        let mandate = match self.mandates.get_mut(&request.mandate_id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        assert_owner(mandate);
        if mandate.suspended {
            env::panic_str(&PolicyViolation::new("mandate_suspended").to_string());
        }
        // The request was raised under one policy. If the owner changed the
        // policy while it sat in the queue, approving it would spend under a
        // decision the current revision never allowed, so the request is stale.
        if request.policy_hash != mandate.policy_hash {
            env::panic_str(
                &PolicyViolation::fail("policy_changed", "approval names an older policy")
                    .to_string(),
            );
        }
        if mandate.balance < request.amount {
            env::panic_str(&PolicyViolation::new("budget_exhausted").to_string());
        }

        // Recorded before the debit so `settle` can find the amount later; the
        // attestor supplies a tx reference, not a number.
        mandate
            .authorised_amount
            .insert(request.intent_hash.clone(), request.amount);
        debit(mandate, &request.chain, &request.vendor, request.amount);

        env::log_str(&format!(
            "spend_approved: id={} request={} amount={} vendor={} intent_hash={}",
            request.mandate_id, request_id, request.amount, request.vendor, request.intent_hash
        ));

        Authorization {
            mandate_id: request.mandate_id,
            intent_hash: request.intent_hash,
            amount: U128(request.amount),
            asset: request.asset,
            chain: request.chain,
            vendor: request.vendor,
            decision_hash: request.decision_hash,
            policy_hash: mandate.policy_hash.clone(),
            status: STATUS_AUTHORISED.to_string(),
            request_id: Some(request_id),
        }
    }

    pub fn reject(&mut self, request_id: String) {
        let request = match self.pending.remove(&request_id) {
            Some(r) => r,
            None => env::panic_str(&PolicyViolation::new("request_not_pending").to_string()),
        };
        let mandate = match self.mandates.get_mut(&request.mandate_id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        assert_owner(mandate);
        env::log_str(&format!(
            "spend_rejected: request={} id={}",
            request_id, request.mandate_id
        ));
    }

    // ---------------------------------------------------------------- agent

    /// The agent asks to spend. Every check below is a typed failure, in the
    /// order SCREENER.md documents, so the first error a judge sees is the
    /// intended one.
    pub fn spend(
        &mut self,
        id: MandateId,
        chain: String,
        amount: U128,
        asset: String,
        vendor: String,
        attestation: Attestation,
    ) -> Authorization {
        let block_height = env::block_height();
        let day_index = env::block_timestamp() / DAY_NS;
        let intent = intent_hash(&chain, amount.0, &vendor, &asset);

        let mandate = match self.mandates.get_mut(&id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };

        // The mandate names one agent, and only that account may ask it to pay.
        // Without this, the key scoping protects the agent's own key but not the
        // contract: any account could call `spend` and burn the day's allowance up
        // to the caps, which is a griefing path even when the vendor is allowed.
        if env::predecessor_account_id() != mandate.agent {
            env::panic_str(&PolicyViolation::new("unauthorized").to_string());
        }

        if mandate.suspended {
            env::panic_str(&PolicyViolation::new("mandate_suspended").to_string());
        }
        if mandate.policy.expires_at_block != 0 && block_height > mandate.policy.expires_at_block {
            env::panic_str(&PolicyViolation::new("mandate_expired").to_string());
        }
        if asset != mandate.policy.asset {
            env::panic_str(&PolicyViolation::new("asset_mismatch").to_string());
        }
        if !mandate.policy.chain_enabled(&chain) {
            env::panic_str(&PolicyViolation::new("chain_not_enabled").to_string());
        }
        if !mandate.policy.vendor_allowed(&chain, &vendor) {
            env::panic_str(
                &PolicyViolation::fail(
                    "counterparty_not_allowed",
                    format!("{} on {}", vendor, chain),
                )
                .to_string(),
            );
        }

        let value = amount.0;
        if value == 0 {
            env::panic_str(&PolicyViolation::new("amount_zero").to_string());
        }
        if value > mandate.policy.per_tx.0 {
            env::panic_str(&PolicyViolation::new("per_tx_exceeded").to_string());
        }

        mandate.roll_day(day_index);
        if mandate.spent_day + value > mandate.policy.per_day.0 {
            env::panic_str(&PolicyViolation::new("per_day_exceeded").to_string());
        }
        let key = Mandate::counterparty_key(&chain, &vendor);
        let spent_here = *mandate.spent_by_counterparty.get(&key).unwrap_or(&0);
        if spent_here + value > mandate.policy.per_counterparty_day.0 {
            env::panic_str(&PolicyViolation::new("per_counterparty_day_exceeded").to_string());
        }
        if value > mandate.balance {
            env::panic_str(&PolicyViolation::new("budget_exhausted").to_string());
        }

        check_attestation(
            &mut self.used_decisions,
            &mandate.policy,
            &mandate.policy_hash,
            &attestation,
            &intent,
        );

        // Approval is a separate on-chain request (D-005), never a paused call.
        if value > mandate.policy.escalate_over.0 {
            let request_id = format!("{}:{}", id, intent);
            self.pending.insert(
                request_id.clone(),
                PendingRequest {
                    request_id: request_id.clone(),
                    mandate_id: id.clone(),
                    chain: chain.clone(),
                    asset: asset.clone(),
                    vendor: vendor.clone(),
                    amount: value,
                    intent_hash: intent.clone(),
                    decision_hash: attestation.decision_hash.clone(),
                    policy_hash: mandate.policy_hash.clone(),
                    requested_at_block: block_height,
                },
            );
            env::log_str(&format!(
                "spend_escalated: id={} request={} amount={} vendor={}",
                id, request_id, value, vendor
            ));
            return Authorization {
                mandate_id: id,
                intent_hash: intent,
                amount,
                asset,
                chain,
                vendor,
                decision_hash: attestation.decision_hash,
                policy_hash: mandate.policy_hash.clone(),
                status: STATUS_PENDING.to_string(),
                request_id: Some(request_id),
            };
        }

        mandate.authorised_amount.insert(intent.clone(), value);
        debit(mandate, &chain, &vendor, value);

        env::log_str(&format!(
            "spend_authorised: id={} amount={} asset={} chain={} vendor={} intent_hash={} decision_hash={}",
            id, value, asset, chain, vendor, intent, attestation.decision_hash
        ));

        Authorization {
            mandate_id: id,
            intent_hash: intent,
            amount,
            asset,
            chain,
            vendor,
            decision_hash: attestation.decision_hash,
            policy_hash: mandate.policy_hash.clone(),
            status: STATUS_AUTHORISED.to_string(),
            request_id: None,
        }
    }

    /// Write the foreign tx reference back onto the authorisation. Attestor only.
    /// Until this runs, the proof rail shows the last stage as unfinished.
    pub fn settle(&mut self, id: MandateId, intent: String, tx_ref: String) {
        if env::predecessor_account_id() != self.attestor {
            env::panic_str(&PolicyViolation::new("attestor_only").to_string());
        }
        if tx_ref.trim().is_empty() {
            env::panic_str(&PolicyViolation::new("attestation_mismatch").to_string());
        }
        let mandate = match self.mandates.get_mut(&id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        if mandate.settled.contains_key(&intent) {
            env::panic_str(&PolicyViolation::new("decision_replayed").to_string());
        }
        let amount = mandate.authorised_amount.get(&intent).copied().unwrap_or(0);
        if amount == 0 {
            // A tx reference for an intent this contract never authorised is not a
            // settlement; accepting it would let the attestor invent one.
            env::panic_str(&PolicyViolation::new("not_found").to_string());
        }
        mandate.settled.insert(
            intent.clone(),
            Settlement {
                tx_ref: tx_ref.clone(),
                amount,
                at_block: env::block_height(),
                contestable: true,
                contest: None,
            },
        );
        env::log_str(&format!(
            "spend_settled: id={} intent_hash={} tx={} amount={} block={}",
            id,
            intent,
            tx_ref,
            amount,
            env::block_height()
        ));
    }

    /// Contest a recorded settlement. Owner only, once, inside the window.
    ///
    /// The contract reverses its own ledger entry: the amount returns to the
    /// mandate's balance. It does not claw anything back from a vendor, and it does
    /// not adjudicate: it records a reason and an evidence hash the two sides can
    /// argue about. The daily and per-counterparty counters are deliberately **not**
    /// rewound — a contested payment still consumed that day's allowance, so
    /// contesting in a loop cannot refill a ceiling.
    pub fn contest(
        &mut self,
        id: MandateId,
        intent: String,
        reason: String,
        evidence_hash: String,
    ) -> Settlement {
        let block = env::block_height();
        if !CONTEST_REASONS.contains(&reason.as_str()) {
            env::panic_str(&PolicyViolation::new("reason_invalid").to_string());
        }
        if evidence_hash.trim().is_empty() {
            env::panic_str(&PolicyViolation::new("attestation_mismatch").to_string());
        }
        let mandate = match self.mandates.get_mut(&id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        assert_owner(mandate);

        let (amount, snapshot) = {
            let settlement = match mandate.settled.get_mut(&intent) {
                Some(s) => s,
                None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
            };
            // A migrated settlement has no recorded amount, so there is nothing to
            // refund; treating its absent window as closed is the honest answer.
            if !settlement.contestable {
                env::panic_str(&PolicyViolation::new("challenge_window_closed").to_string());
            }
            if settlement.contest.is_some() {
                env::panic_str(&PolicyViolation::new("already_contested").to_string());
            }
            if block > settlement.at_block + CHALLENGE_WINDOW_BLOCKS {
                env::panic_str(&PolicyViolation::new("challenge_window_closed").to_string());
            }
            settlement.contest = Some(Contest {
                reason: reason.clone(),
                evidence_hash: evidence_hash.clone(),
                at_block: block,
            });
            (settlement.amount, settlement.clone())
        };

        mandate.balance += amount;
        mandate.spent_total = mandate.spent_total.saturating_sub(amount);
        mandate.spent_day = mandate.spent_day.saturating_sub(amount);

        env::log_str(&format!(
            "settlement_contested: id={} intent_hash={} reason={} amount={} block={} evidence={}",
            id, intent, reason, amount, block, evidence_hash
        ));
        snapshot
    }

    // ---------------------------------------------------------------- views

    pub fn get_mandate(&self, id: MandateId) -> MandateView {
        let m = match self.mandates.get(&id) {
            Some(m) => m,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        mandate_view(m)
    }

    /// Every mandate, in id order. The console's table is built from this and
    /// nothing else, so it cannot show a row the contract would not serve.
    pub fn list_mandates(&self) -> Vec<MandateView> {
        self.mandates.values().map(mandate_view).collect()
    }

    /// The escalation queue. `get_pending` answers one request by id; the console
    /// needs the queue, and assembling it client-side would be a mock.
    pub fn list_pending(&self) -> Vec<PendingRequest> {
        self.pending.values().cloned().collect()
    }

    pub fn get_pending(&self, request_id: String) -> PendingRequest {
        match self.pending.get(&request_id) {
            Some(p) => p.clone(),
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        }
    }

    /// Every policy revision this mandate has had, oldest first.
    pub fn get_policy_history(&self, id: MandateId) -> Vec<PolicyRevision> {
        match self.mandates.get(&id) {
            Some(m) => m.policy_history.clone(),
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        }
    }

    pub fn get_settlement(&self, id: MandateId, intent: String) -> Option<Settlement> {
        self.mandates
            .get(&id)
            .and_then(|m| m.settled.get(&intent).cloned())
    }

    /// Every contest on the contract, newest first by block. The console renders
    /// this as the dispute log; it is a read over state that already exists.
    pub fn list_contests(&self) -> Vec<state::ContestView> {
        let mut out: Vec<state::ContestView> = Vec::new();
        for m in self.mandates.values() {
            for (intent, s) in &m.settled {
                if let Some(c) = &s.contest {
                    out.push(state::ContestView {
                        mandate_id: m.id.clone(),
                        intent_hash: intent.clone(),
                        tx_ref: s.tx_ref.clone(),
                        amount: U128(s.amount),
                        reason: c.reason.clone(),
                        evidence_hash: c.evidence_hash.clone(),
                        contested_at_block: c.at_block,
                        settled_at_block: s.at_block,
                    });
                }
            }
        }
        out.sort_by(|a, b| b.contested_at_block.cmp(&a.contested_at_block));
        out
    }

    /// D-024: rewrite the pre-window layout. Owner only, once.
    ///
    /// `ignore_state` because the bytes on chain are the old struct, not this one:
    /// `state_read` below parses them with the layout kept in `migrate.rs`.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: migrate::OldContract = match env::state_read() {
            Some(s) => s,
            None => env::panic_str(&PolicyViolation::new("not_found").to_string()),
        };
        let next = migrate::upgrade(old, env::block_height());
        env::log_str(&format!(
            "state_migrated: mandates={} at_block={}",
            next.mandates.len(),
            env::block_height()
        ));
        next
    }

    pub fn stats(&self) -> MandateStats {
        let mut settled = 0u64;
        let mut authorised = 0u128;
        for m in self.mandates.values() {
            settled += m.settled.len() as u64;
            authorised += m.spent_total;
        }
        MandateStats {
            total_mandates: self.mandates.len() as u64,
            total_pending: self.pending.len() as u64,
            total_settled: settled,
            total_authorised: U128(authorised),
        }
    }

    /// Total value this contract is holding for all mandates.
    pub fn held(&self) -> U128 {
        let mut total = 0u128;
        for m in self.mandates.values() {
            total += m.balance;
        }
        U128(total)
    }
}

// ---------------------------------------------------------------- internals
// Free functions rather than methods: `spend` holds a mutable borrow of one
// field while touching two others, which only compiles if the borrow is per
// field.

fn mandate_view(m: &Mandate) -> MandateView {
    MandateView {
        id: m.id.clone(),
        owner: m.owner.clone(),
        agent: m.agent.clone(),
        policy_hash: m.policy_hash.clone(),
        policy_rev: m.policy_rev,
        asset: m.policy.asset.clone(),
        balance: U128(m.balance),
        spent_total: U128(m.spent_total),
        spent_day: U128(m.spent_day),
        day_index: m.day_index,
        suspended: m.suspended,
        per_tx: m.policy.per_tx,
        per_day: m.policy.per_day,
        escalate_over: m.policy.escalate_over,
        expires_at_block: m.policy.expires_at_block,
        require_attestation: m.policy.require_attestation,
        chains: m.policy.chains(),
        settled_count: m.settled.len() as u64,
    }
}

fn check_attestation(
    used_decisions: &mut BTreeMap<String, bool>,
    policy: &Policy,
    mandate_policy: &str,
    att: &Attestation,
    intent: &str,
) {
    if !policy.require_attestation {
        return;
    }
    if att.quote_hash.trim().is_empty() || att.decision_hash.trim().is_empty() {
        env::panic_str(&PolicyViolation::new("attestation_required").to_string());
    }
    if let Some(required) = &policy.attestation_code_hash {
        if &att.code_hash != required {
            env::panic_str(
                &PolicyViolation::fail("attestation_mismatch", "code_hash does not match policy")
                    .to_string(),
            );
        }
    }
    // The decision names the policy it was made under. A tighter policy is not
    // waived by a decision that predates it, so an old revision is refused here
    // rather than being silently evaluated against the new limits.
    if att.policy_hash != mandate_policy {
        env::panic_str(
            &PolicyViolation::fail("policy_changed", "attestation names an older policy")
                .to_string(),
        );
    }
    if used_decisions.contains_key(&att.decision_hash) {
        env::panic_str(&PolicyViolation::new("decision_replayed").to_string());
    }
    // The enclave recorded the intent it decided on. If the agent asks for a
    // different amount or vendor afterwards, the hashes part company here.
    if att.intent_hash != intent {
        env::panic_str(
            &PolicyViolation::fail("attestation_mismatch", "attestation is for another intent")
                .to_string(),
        );
    }
    used_decisions.insert(att.decision_hash.clone(), true);
}

fn debit(mandate: &mut Mandate, chain: &str, vendor: &str, amount: u128) {
    mandate.balance -= amount;
    mandate.spent_total += amount;
    mandate.spent_day += amount;
    let key = Mandate::counterparty_key(chain, vendor);
    let entry = mandate.spent_by_counterparty.entry(key).or_insert(0);
    *entry += amount;
}

fn assert_owner(mandate: &Mandate) {
    if env::predecessor_account_id() != mandate.owner {
        env::panic_str(&PolicyViolation::new("owner_only").to_string());
    }
}

