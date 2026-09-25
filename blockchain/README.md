# Blockchain (academic prototype)

`CarbonCreditCertificate.sol` stores **payload hashes only**.

Deploy locally with Ganache + Remix or Hardhat when available:

```bash
# ganache -p 8545
# then set GANACHE_RPC=http://127.0.0.1:8545
```

Until Ganache is running, the Node API writes SHA-256 certificate hashes to
`blockchain/academic_ledger.json` and labels the mode `ACADEMIC_LEDGER`.

This is **not** official carbon-credit issuance.
