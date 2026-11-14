//! State migration for the challenge window (D-024).
//!
//! `Mandate.settled` was `BTreeMap<String, String>` — intent hash to a foreign tx
//! reference. A contest needs the amount and the block, so the value became a
//! `Settlement`. Borsh is positional: reading the old bytes with the new struct
//! fails, and the 17 mandates on the deployed account would be unreadable.
//!
//! This module keeps the old layout, field for field and in order, so `migrate()`
//! can read it once and write the new one. Nothing here is a new truth: every
//! migrated settlement is marked `contestable: false`, because its amount was
//! never stored and a refund amount cannot be invented after the fact.

use std::collections::BTreeMap;

use near_sdk::near;
use near_sdk::AccountId;

use crate::policy::Policy;
use crate::state::{PendingRequest, PolicyRevision, Settlement};

/// The shape of `Mandate` before D-024. Field order is the serialised order.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct OldMandate {
    pub id: String,
    pub owner: AccountId,
    pub agent: AccountId,
    pub policy: Policy,
    pub policy_hash: String,
    pub policy_rev: u32,
    pub policy_history: Vec<PolicyRevision>,
    pub balance: u128,
    pub spent_total: u128,
    pub spent_day: u128,
    pub day_index: u64,
    pub spent_by_counterparty: BTreeMap<String, u128>,
    pub suspended: bool,
    pub created_at_block: u64,
    pub settled: BTreeMap<String, String>,
}

/// The shape of `Contract` before D-024.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct OldContract {
    pub owner: AccountId,
    pub attestor: AccountId,
    pub mandates: BTreeMap<String, OldMandate>,
    pub pending: BTreeMap<String, PendingRequest>,
    pub used_decisions: BTreeMap<String, bool>,
    pub next_id: u64,
}

/// Convert one old mandate. Balances and counters are copied unchanged: a
/// migration must not alter what anyone is owed.
pub fn upgrade_mandate(old: OldMandate, at_block: u64) -> crate::state::Mandate {
    let settled = old
        .settled
        .into_iter()
        .map(|(intent, tx_ref)| {
            (
                intent,
                Settlement {
                    tx_ref,
                    amount: 0,
                    at_block,
                    contestable: false,
                    contest: None,
                },
            )
        })
        .collect();

    crate::state::Mandate {
        id: old.id,
        owner: old.owner,
        agent: old.agent,
        policy: old.policy,
        policy_hash: old.policy_hash,
        policy_rev: old.policy_rev,
        policy_history: old.policy_history,
        balance: old.balance,
        spent_total: old.spent_total,
        spent_day: old.spent_day,
        day_index: old.day_index,
        spent_by_counterparty: old.spent_by_counterparty,
        suspended: old.suspended,
        created_at_block: old.created_at_block,
        settled,
        authorised_amount: BTreeMap::new(),
    }
}

/// The shape of `Contract` immediately before D-029, when `attestor_key` was
/// added. It is spelled out rather than referenced so a later change to the live
/// struct cannot silently change what this migration reads.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct ContractV3 {
    pub owner: AccountId,
    pub attestor: AccountId,
    pub mandates: BTreeMap<String, crate::state::Mandate>,
    pub pending: BTreeMap<String, PendingRequest>,
    pub used_decisions: BTreeMap<String, bool>,
    pub next_id: u64,
}

/// Kept out of `lib.rs` so that file stays about behaviour.
pub fn upgrade(old: OldContract, at_block: u64) -> crate::Contract {
    let mandates = old
        .mandates
        .into_iter()
        .map(|(id, m)| (id, upgrade_mandate(m, at_block)))
        .collect();

    crate::Contract {
        owner: old.owner,
        attestor: old.attestor,
        mandates,
        pending: old.pending,
        used_decisions: old.used_decisions,
        next_id: old.next_id,
        attestor_key: None,
    }
}
