# Freezelist Utility

A CLI tool for managing the freeze list in compliant stablecoin token programs. Allows freezing and unfreezing addresses by updating the on-chain Merkle tree-based freeze list.

For details about the token program itself, please see https://github.com/ProvableHQ/compliant-stablecoin.

## Prerequisites

- Node.js
- An Aleo account with `FREEZELIST_MANAGER_ROLE` (role bit 16) assigned to it for the program you want to interact with.

## Installation

```bash
npm install
```

## Usage

```bash
node index.js <freeze|unfreeze> <programName> <address>
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes | - | Aleo private key with freezelist manager permissions |
| `ENDPOINT` | No | `http://127.0.0.1:3030` | Aleo node RPC endpoint |
| `CONSENSUS_VERSION_HEIGHTS` | No | - | Comma-separated list of consensus version heights to override the default ones |

### Examples

Freeze an address:
```bash
PRIVATE_KEY=APrivateKey1... node index.js freeze token_program.aleo aleo1abc...xyz
```

Unfreeze an address:
```bash
PRIVATE_KEY=APrivateKey1... node index.js unfreeze token_program.aleo aleo1abc...xyz
```

## Local testing

1. Setup a local devnode:
1.1. Clone https://github.com/ProvableHQ/leo and checkout the branch `feat/leo-devnode-final`. At the time of writing, commit `92ec02cdca8142c8d2b546fdc6783d304f3ff821` was the latest.
1.2. Build leo: `cargo build`
1.3. Start the devnode: `./target/release/leo devnode start`
2. Clone https://github.com/ProvableHQ/compliant-stablecoin and go into that directory.
3. Set the following environment variables:
   - `PRIVATE_KEY=APrivateKey1zkp8CZNn3yeCseEtxuVPbDCwSyhGW6yZKUYKfgXmcpoGPWH`
   - `ENDPOINT=http://localhost:3030`
   - `NETWORK=testnet`
   - `LEO=<path to the leo repository>/target/release/leo`
4. Deploy the freezelist program: `cd freezelist_program && $LEO deploy --broadcast -y --skip-deploy-certificate`
5. Initialize the freezelist (first input assigns the program manager, second input is the block window for accepting old Merkle roots):
   - `$LEO execute freezelist_program.aleo/initialize aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px 300u32 --broadcast --skip-execute-proof`
6. (Optional) Verify that the [freezelist root endpoint](http://localhost:3030/testnet/program/freezelist_program.aleo/mapping/freeze_list_root/1u8) returns `3642222252059314292809609689035560016959342421640560347114299934615987159853field`.
7. Assign the freeze list manager (Can add and remove addresses from the freeze list):
   - `$LEO execute freezelist_program.aleo/update_role aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px 24u16 --broadcast --skip-execute-proof`
8. You should now be able to use the `freezelist-util` script to interact with the freezelist program:
   - `node index.js freeze freezelist_program.aleo aleo1aj9ygd262s05dfv7gz2arrfw3yuqrke0866wjy74dpzp8jknjyysyle7qd`
