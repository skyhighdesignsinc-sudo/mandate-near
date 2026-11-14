//! Stored types for the mandate.
//!
//! Budget = the balance this contract holds for the mandate (D-002). There is no
//! MPC comparison anywhere: the agent asks the contract to spend, the contract
//! checks its own balance and its own counters. Nothing off-chain decides an
//! amount.
//!
//! A mandate authorises; it does not move value by itself. `spend` returns an
//! Authorization that the settlement worker turns into a foreign-chain
//! transaction, and `settle` records the resulting tx reference against the same
//! intent hash. That two-phase shape is what makes the proof rail honest: an
//! authorisation with no settlement is visibly unfinished.

use std::collections::BTreeMap;

use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::AccountId;

use crate::policy::Policy;

pub type MandateId = String;

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Mandate {
    pub id: MandateId,
    pub owner: AccountId,
    /// The account the agent runs as. It calls `spend`; it holds no key that can
    /// transfer value, add a key, or call any other contract.
    pub agent: AccountId,
    pub policy: Policy,
    pub policy_hash: String,
    /// Monotonic revision of the policy. Revision 1 is the one it was created
    /// with; every `update_policy` that changes the hash increments it.
    pub policy_rev: u32,
    /// Every revision, oldest first. The console renders this as the audit trail
    /// of what the agent was allowed to do, and at which block.
    pub policy_history: Vec<PolicyRevision>,
    /// Funded balance held by this contract, in the policy's asset.
    pub balance: u128,
    pub spent_total: u128,
    /// Rolling per-day spend, reset when `day_index` moves.
    pub spent_day: u128,
    /// Unix day number (block_timestamp / 86_400_000).
    pub day_index: u64,
    /// `"{chain}:{vendor}" -> amount spent today`.
    pub spent_by_counterparty: BTreeMap<String, u128>,
    pub suspended: bool,
    pub created_at_block: u64,
    /// `intent_hash -> settlement`, written by `settle`. It carries the amount and
    /// the block, because a contest has to know what to refund and whether the
    /// window is still open.
    pub settled: BTreeMap<String, Settlement>,
    /// `intent_hash -> amount`, written when the spend is debited. `settle` reads
    /// it, because the attestor supplies a tx reference and not an amount.
    pub authorised_amount: BTreeMap<String, u128>,
}

/// A settlement is a recorded authorisation plus its foreign transaction
/// reference. It does not move value: the contract already holds the funds.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Settlement {
    pub tx_ref: String,
    pub amount: u128,
    /// Height at which the reference was recorded, and the anchor for the window.
    pub at_block: u64,
    /// False for settlements migrated from before the window existed: their
    /// amount was never stored, so they cannot be contested without inventing one.
    pub contestable: bool,
    pub contest: Option<Contest>,
}

/// A payer's reversal of an authorisation it has already recorded.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Contest {
    /// One of `CONTEST_REASONS`; frozen so the console can group them.
    pub reason: String,
    /// sha256 the payer supplies for whatever it is relying on. The contract
    /// records it and does not fetch it: saying so is the difference between a
    /// claim and a lie.
    pub evidence_hash: String,
    pub at_block: u64,
}

impl Mandate {
    pub fn counterparty_key(chain: &str, vendor: &str) -> String {
        format!("{}:{}", chain, vendor)
    }

    /// Advance the rolling window if the calendar day changed.
    ///
    /// The second condition repairs mandates written before D-028. Their
    /// `day_index` was stored on a finer scale than `block_timestamp / 86_400e9`,
    /// so it sits far in the future on the current scale and `day_index >
    /// self.day_index` never fired: the daily counter quietly became a lifetime
    /// counter and the mandate could never spend again. A stored value more than
    /// 30,000 days ahead of the chain's own day cannot be a real day count, so it
    /// is stale and reset. The check is monotone on the new scale: once a mandate
    /// has rolled once, its `day_index` is a real day and the branch stops firing.
    pub fn roll_day(&mut self, day_index: u64) {
        if day_index > self.day_index || self.day_index > day_index.saturating_add(30_000) {
            self.day_index = day_index;
            self.spent_day = 0;
            self.spent_by_counterparty.clear();
        }
    }
}

/// What the agent presents when it wants to spend.
///
/// `quote_hash` is sha256 of the attestation quote the enclave produced (or of
/// the mock record when TEE_PROVIDER=none). The contract stores and compares the
/// hash; it does not verify Intel's signature. Saying so is the difference
/// between a claim and a lie.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Attestation {
    /// sha256 of the decision the agent reached, as recorded by the enclave.
    pub decision_hash: String,
    /// sha256 of the code that produced the decision. Must equal the policy's
    /// `attestation_code_hash` when one is set.
    pub code_hash: String,
    /// sha256 of the hardware quote, kept for the verifier page.
    pub quote_hash: String,
    /// The policy revision the enclave decided under. `spend` refuses when this
    /// is not the mandate's current hash: a decision made before a policy was
    /// tightened does not spend under the tightened policy.
    pub policy_hash: String,
    /// The intent the enclave decided on. Recomputed by `spend` from
    /// (chain, amount, vendor, asset); a mismatch means the agent changed the
    /// request after the decision was attested.
    pub intent_hash: String,
}

pub const STATUS_AUTHORISED: &str = "authorised";
pub const STATUS_PENDING: &str = "pending";

/// Returned by `spend` and `approve`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Authorization {
    pub mandate_id: MandateId,
    /// Recompute this from (chain, amount, vendor, asset) to check the contract
    /// did what the caller asked.
    pub intent_hash: String,
    pub amount: U128,
    pub asset: String,
    pub chain: String,
    pub vendor: String,
    pub decision_hash: String,
    /// The policy revision this authorisation was decided under.
    pub policy_hash: String,
    /// `authorised` when the balance was debited now, `pending` when the amount
    /// was above `escalate_over` and the owner has not answered yet.
    pub status: String,
    /// Present only for `pending`.
    pub request_id: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct PendingRequest {
    pub request_id: String,
    pub mandate_id: MandateId,
    pub chain: String,
    pub asset: String,
    pub vendor: String,
    pub amount: u128,
    pub intent_hash: String,
    pub decision_hash: String,
    /// The policy the request was raised under, so approval cannot silently
    /// answer a request that a later revision has already invalidated.
    pub policy_hash: String,
    pub requested_at_block: u64,
}

/// One entry in a mandate's policy history. Amounts are the limits in force at
/// `at_block`, so the difference between two entries is the whole diff.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct PolicyRevision {
    pub rev: u32,
    pub hash: String,
    pub at_block: u64,
    pub per_tx: U128,
    pub per_day: U128,
    pub per_counterparty_day: U128,
    pub escalate_over: U128,
}

/// One row of the console's spend table.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct MandateView {
    pub id: MandateId,
    pub owner: AccountId,
    pub agent: AccountId,
    pub policy_hash: String,
    /// Current policy revision; equals `policy_history.len()`.
    pub policy_rev: u32,
    pub asset: String,
    pub balance: U128,
    pub spent_total: U128,
    pub spent_day: U128,
    pub day_index: u64,
    pub suspended: bool,
    pub per_tx: U128,
    pub per_day: U128,
    pub escalate_over: U128,
    pub expires_at_block: u64,
    pub require_attestation: bool,
    pub chains: Vec<String>,
    pub settled_count: u64,
}

/// One row of the console's dispute log.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ContestView {
    pub mandate_id: MandateId,
    pub intent_hash: String,
    pub tx_ref: String,
    pub amount: U128,
    pub reason: String,
    pub evidence_hash: String,
    pub contested_at_block: u64,
    pub settled_at_block: u64,
}

/// Counters the console footer prints. Every number here is a contract read.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct MandateStats {
    pub total_mandates: u64,
    pub total_pending: u64,
    pub total_settled: u64,
    pub total_authorised: U128,
}
