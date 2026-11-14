# UML and flow diagrams

> Mermaid blocks render on GitHub and in most editors. The console's **Paper**
> route shows the same diagrams as source, because a static, offline page cannot
> run a renderer without adding a dependency (D-012, D-016). The prose beside each
> diagram is the authoritative part; the picture is a convenience.

Contents: component view · spend sequence · refusal sequence · policy amendment
sequence · mandate state machine · data model · check order · deployment.

---

## 1. Component view

```mermaid
graph TD
  Owner["Owner (human)"] -->|create_mandate, fund, update_policy, suspend| C["mandate contract"]
  Agent["Agent process (may be injected)"] -->|"spend() via FunctionCall key"| C
  Attestor["Attestor account"] -->|"settle(intent, tx_ref)"| C
  Console["Static console (no key)"] -->|reads snapshot only| Snap["snapshot.json"]
  C -->|"serialised by make demo"| Snap
  Judge["Judge / browser"] -->|"recomputes hashes"| Console
  Chain["Foreign chain"] -.->|"tx reference, asserted"| Attestor
```

The console never writes and holds no key. The only writer paths are the three
accounts above; the only cross-chain fact in the system is the settlement
reference, which is asserted rather than proven.

---

## 2. Sequence: an authorised spend

```mermaid
sequenceDiagram
  autonumber
  participant A as Agent
  participant M as mandate contract
  participant O as Owner
  participant T as Attestor
  participant F as Foreign chain

  A->>M: spend(chain, amount, asset, vendor, attestation)
  M->>M: guards, ceilings, balance
  M->>M: policy_hash matches revision
  M->>M: decision unused, intent matches
  alt amount <= escalate_over
    M->>M: debit balance, bump counters
    M-->>A: Authorization(status=authorised)
  else amount > escalate_over
    M->>M: store PendingRequest (no debit)
    M-->>A: Authorization(status=pending)
    O->>M: approve(request_id)
    M->>M: policy unchanged? balance sufficient?
    M-->>O: Authorization(status=authorised)
  end
  T->>M: settle(intent_hash, tx_ref)
  M-->>T: settled once
  F-->>T: transaction exists (asserted, not proven on-chain)
```

---

## 3. Sequence: prompt injection is refused

```mermaid
sequenceDiagram
  autonumber
  participant I as Injected agent
  participant M as mandate contract
  participant O as Owner

  I->>M: spend(5.00, vendor=0xdead…)
  M->>M: vendor not in allowlist
  M-->>I: PolicyViolation: counterparty_not_allowed
  Note over I: a direct transfer has no key that permits it
  I->>M: spend(7.00) with an attestation for 8.00
  M->>M: intent_hash mismatch
  M-->>I: PolicyViolation: attestation_mismatch
  O->>M: suspend()
  I->>M: spend(5.00)
  M-->>I: PolicyViolation: mandate_suspended
  O->>M: resume()
  Note over M: same mandate, same balance, no new key
```

---

## 4. Sequence: an amendment invalidates older decisions

```mermaid
sequenceDiagram
  autonumber
  participant O as Owner
  participant M as mandate contract
  participant A as Agent

  A->>M: spend(5.00, attestation.policy_hash = rev1)
  M-->>A: authorised (rev1)
  O->>M: update_policy(tighter)
  M->>M: rev 1 -> 2, append PolicyRevision
  M-->>O: new policy_hash
  A->>M: spend(5.00, attestation still rev1)
  Note over M: 5.00 is inside every new limit
  M-->>A: PolicyViolation: policy_changed
  A->>M: spend(5.00, re-attested under rev2)
  M-->>A: authorised (rev2)
```

This is demo events 13–15. It is also the reason `approve` re-checks the policy
hash: a request queued under revision 1 is refused after the amendment.

---

## 5. State machine

```mermaid
stateDiagram-v2
  [*] --> Active: create_mandate(deposit)
  Active --> Active: spend (debit) / fund / update_policy
  Active --> Pending: spend above escalate_over
  Pending --> Active: approve (debit) / reject (no debit)
  Active --> Suspended: suspend
  Suspended --> Active: resume
  Active --> Expired: block > expires_at_block
  Expired --> [*]
  Active --> Closed: balance exhausted
  Closed --> [*]
```

`Expired` and `Closed` are conditions evaluated at call time, not stored states:
the contract refuses with `mandate_expired` or `budget_exhausted` and leaves the
record readable. A suspended mandate never loses its balance or its counters.

---

## 6. Data model

```mermaid
erDiagram
  MANDATE ||--o{ POLICY_REVISION : "has history"
  MANDATE ||--o{ SETTLEMENT : "records"
  MANDATE ||--o{ PENDING_REQUEST : "queues"
  MANDATE }o--|| POLICY : "current"
  POLICY ||--o{ ALLOW_ENTRY : "lists"
  PENDING_REQUEST }o--|| ATTESTATION : "names decision"
  MANDATE {
    string id
    string owner
    string agent
    u128 balance
    u128 spent_total
    u128 spent_day
    u64 day_index
    u32 policy_rev
    bool suspended
  }
  POLICY_REVISION {
    u32 rev
    string hash
    u64 at_block
    u128 per_tx
    u128 per_day
    u128 per_counterparty_day
    u128 escalate_over
  }
  PENDING_REQUEST {
    string request_id
    u128 amount
    string intent_hash
    string decision_hash
    string policy_hash
  }
  SETTLEMENT {
    string intent_hash
    string tx_ref
  }
```

The used-decision set is a flat map `decision_hash -> true`; it enforces "one
decision, one spend" across all mandates in the deployment.

---

## 7. Check order

```mermaid
flowchart TD
  S["spend(id, chain, amount, asset, vendor, att)"] --> A{"suspended?"}
  A -- yes --> E1["mandate_suspended"]
  A -- no --> B{"block > expiry?"}
  B -- yes --> E2["mandate_expired"]
  B -- no --> C{"asset matches?"}
  C -- no --> E3["asset_mismatch"]
  C -- yes --> D{"chain enabled?"}
  D -- no --> E4["chain_not_enabled"]
  D -- yes --> E5{"vendor allowed?"}
  E5 -- no --> E6["counterparty_not_allowed"]
  E5 -- yes --> F{"amount > 0?"}
  F -- no --> E7["amount_zero"]
  F -- yes --> G{"<= per_tx?"}
  G -- no --> E8["per_tx_exceeded"]
  G -- yes --> H{"<= per_day?"}
  H -- no --> E9["per_day_exceeded"]
  H -- yes --> I{"<= per_counterparty?"}
  I -- no --> E10["per_counterparty_day_exceeded"]
  I -- yes --> J{"<= balance?"}
  J -- no --> E11["budget_exhausted"]
  J -- yes --> K{"attestation.policy_hash == current?"}
  K -- no --> E12["policy_changed"]
  K -- yes --> L{"decision unused?"}
  L -- no --> E13["decision_replayed"]
  L -- yes --> M{"intent matches?"}
  M -- no --> E14["attestation_mismatch"]
  M -- yes --> N{"> escalate_over?"}
  N -- yes --> P["store pending, return pending"]
  N -- no --> Q["debit, return authorised"]
```

---

## 8. Deployment

```mermaid
graph LR
  subgraph Local["make dev (works today, no secrets)"]
    S1["snapshot.json"] --> C1["static console :4173"]
  end
  subgraph Testnet["planned (H-6 blocked)"]
    Acc["funded account + FunctionCall key"] --> Dep["mandate.testnet"]
    Dep --> Reads["view calls"]
    Reads --> C2["console: live read-only"]
    Dep --> Tx["explorer link in SCREENER"]
  end
```

The local path is what a screener gets. The testnet path is written down with its
blocker rather than mocked.
