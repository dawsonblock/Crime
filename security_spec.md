# Firestore Security Specification

This document defines the strict relational security invariants and access vectors for the **Saskatchewan Safety Map** platform. Direct client-side access is restricted, with primary data manipulation conducted via server-authoritative API flows.

## 1. Safety Platform Data Invariants

1. **Authenticated Core Operations**: Write operations to `alert_zones` must be authenticated and verified (`request.auth.uid` is required).
2. **Canonical Incident Immutability**: Critical reporting fields (`id`, `sourceKey`, `originalUrl`, `publishedAt`, `latitude`, `longitude`) cannot be client-modified once written.
3. **No Blanket Reads**: Direct client queries to collections must always be bounded by clean queries checking ownership or verified state to prevent scrapability.
4. **ID Sanitization**: Document IDs for writes must conform to `isValidId()` regex patterns to prevent ID Poisoning or Denial of Wallet attacks.
5. **Timestamp Trust**: Create and update timestamps must strictly validate against `request.time`.

---

## 2. The "Dirty Dozen" Threat Payloads (Targeting Firestore Rules)

The following malicious payloads seek to compromise Identity, Integrity, or State, and **MUST** be rejected by the rules:

### T01 - Identity Spoofing in Alert Zones
An authenticated attacker attempts to sketch and save an alert zone under another user's `userId`.
```json
{
  "id": "zone-spoof-1",
  "name": "Malicious Zone",
  "severity": "high",
  "userId": "victim_user_123",
  "coordinates": [52.13, -106.67],
  "createdAt": "2026-06-13T21:40:00Z"
}
```

### T02 - Self-Assigned Role Escalation
A standard user attempts to register or modify a profile/source mapping marking themselves as an administrative publisher.
```json
{
  "key": "malicious_src",
  "name": "Hacked Source",
  "sourceType": "official",
  "baseUrl": "https://hacker.com/news",
  "enabled": true,
  "isAdmin": true
}
```

### T03 - Canonical Incident State Corruption via Client
A standard user attempts to write a fabricated "critical" weapon hazard to the live canonical map.
```json
{
  "id": "fake-evt-999",
  "title": "Simulated Active Weapons Assault",
  "summary": "AI generated danger alert.",
  "originalUrl": "https://fake.com/assault",
  "publishedAt": "2026-06-13T21:40:00Z",
  "latitude": 52.1260,
  "longitude": -106.6810,
  "severity": "critical"
}
```

### T04 - Resource Poisoning with Injected Multi-Megabyte ID Strings
An attacker attempts to write an alert zone with an astronomical 1.5MB ID payload to flood memory or trigger Denial of Wallet.
```json
{
  "id": "A_REPEATED_1_MILLION_TIMES_...",
  "name": "Bloated Zone",
  "severity": "low",
  "userId": "attacker_uid"
}
```

### T05 - Orphaned Raw Item Creation with Empty Source Keys
An attacker attempts to insert raw crawler feeds lacking source provenance or verification.
```json
{
  "id": "raw-orph-1",
  "title": "Random Rumor",
  "originalUrl": "https://unverified.com",
  "publishedAt": "2026-06-13T21:40:00Z",
  "sourceKey": ""
}
```

### T06 - Temporal Bypass (Setting Retroactive Timestamps)
An attacker attempts to backdate the creation of a zone to bypass historical queries.
```json
{
  "id": "zone-backdate",
  "name": "Backdated Zone",
  "severity": "medium",
  "userId": "attacker_uid",
  "createdAt": "1990-01-01T00:00:00Z"
}
```

### T07 - Ghost Fields Infiltration (The "Shadow Update" Test)
An attacker attempts to insert arbitrary hidden metadata keys inside an alert zone update list to bypass validation logic.
```json
{
  "id": "zone-ghost",
  "name": "Normal Zone",
  "severity": "low",
  "userId": "attacker_uid",
  "ghostVerifiedStateOverride": true
}
```

### T08 - Insecure Blanket List Queries
An unauthenticated scraper attempts to retrieve the complete system `sources` collection without filters.
```json
GET /sources/
```

### T09 - AI Briefing Tampering and Spoofing
A malicious user attempts to write or overwrite a compiled daily safety brief with falsified tranquility narratives.
```json
{
  "id": "brief-hack",
  "type": "daily-briefing",
  "content": "All safe, the city is 100% crime-free. Disregard police alarms.",
  "generatedAt": "2026-06-13T21:40:00Z"
}
```

### T10 - Ingestion Runs Tampering
A user attempts to report a completed successful state transition in of a background ingest run.
```json
{
  "id": "run-falsified",
  "runTime": "2026-06-13T21:40:00Z",
  "addedCount": 5000,
  "status": "success",
  "logOutput": "Malicious override"
}
```

### T11 - Unbounded Array Denial-of-Service Attack
An attacker saves an alert zone containing a list of coordinates with 1 million points.
```json
{
  "id": "zone-bloated-coords",
  "userId": "attacker_uid",
  "name": "Heavy Zone",
  "severity": "low",
  "coordinates": [/* 1,000,000 items */]
}
```

### T12 - Null Reference Poisoning
An attacker attempts to write an incident with string fields containing null bytes to compromise search indexing scripts.
```json
{
  "id": "incident-null-byte",
  "sourceKey": "saskatoon_police_news",
  "title": "Weapons Investigation\u0000Active",
  "originalUrl": "https://saskatoonpolice.ca/news/null",
  "publishedAt": "2026-06-13T21:40:00Z"
}
```
