import { Account, ProgramManager, AleoKeyProvider, initThreadPool, getOrInitConsensusVersionTestHeights, SealanceMerkleTree, Plaintext } from "@provablehq/sdk";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ENDPOINT = process.env.ENDPOINT || "http://127.0.0.1:3030";
const CONSENSUS_VERSION_HEIGHTS = process.env.CONSENSUS_VERSION_HEIGHTS;

const args = process.argv.slice(2);
if (args.length !== 3) {
    console.error("Usage: index.js <freeze/unfreeze> <programName> <address>");
    process.exit(1);
}

const [action, programName, updateAddress] = args;
if (action !== "freeze" && action !== "unfreeze") {
    console.error("Error: First argument must be 'freeze' or 'unfreeze'");
    process.exit(1);
}
const updateAddressStatus = action === "freeze";

if (CONSENSUS_VERSION_HEIGHTS) {
    await getOrInitConsensusVersionTestHeights(CONSENSUS_VERSION_HEIGHTS);
}
await initThreadPool();


const FREEZELIST_MANAGER_ROLE = 16;
const CURRENT_FREEZE_LIST_ROOT_INDEX = '1u8';
const ZERO_ADDRESS = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';

if (!PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY environment variable is required");
    process.exit(1);
}

const account = new Account({ privateKey: PRIVATE_KEY });
const keyProvider = new AleoKeyProvider();
keyProvider.useCache(true);

const programManager = new ProgramManager(ENDPOINT, keyProvider);
programManager.setAccount(account);
const readFreezelistMapping = async (mappingName, mappingKey) => {
    const val = await programManager.networkClient.getProgramMappingValue(
        programName, mappingName, mappingKey,
    );
    if (val == null) return null;
    return Plaintext.fromString(val).toObject();
};

// Check that account has permission to update the freezelist
const accountRole = await readFreezelistMapping("address_to_role", account.address().to_string()) || 0;
if ((accountRole & FREEZELIST_MANAGER_ROLE) == 0) {
    console.error(`Error: Account does not have permission to update the freezelist (got ${accountRole})`);
    process.exit(1);
}

// Get current freeze list root, which will become the previous one once we update.
const previousRoot = await readFreezelistMapping("freeze_list_root", CURRENT_FREEZE_LIST_ROOT_INDEX);
if (!previousRoot) throw new Error("Previous freeze list root not found");
console.log(`Previous freeze list root: ${previousRoot}`)

// Get current address status
const curAddressStatus = await readFreezelistMapping("freeze_list", updateAddress) || false;
console.log(`Current status of ${updateAddress}: ${curAddressStatus}, new status: ${updateAddressStatus}`)
if (curAddressStatus === updateAddressStatus) {
    console.log(`No change in status for ${updateAddress}`);
    process.exit(0);
}

// Load current freezelist
const lastIndex = await readFreezelistMapping("freeze_list_last_index", true);
if (lastIndex == null) throw new Error("Previous freeze list index not found");
console.log(`Previous freeze list index: ${lastIndex}`);

const addresses = [];
for (let i = 0; i < lastIndex + 1; i++) {
    const address = await readFreezelistMapping("freeze_list_index", `${i}u32`);
    if (address == null) throw new Error(`Address at index ${i} not found`);
    addresses.push(address);
}
console.log(`Loaded ${addresses.length} addresses from freezelist: ${JSON.stringify(addresses)}`);

let frozenIndex = addresses.findIndex(addr => addr === updateAddress);
if (updateAddressStatus) {
    // Freeze
    if (frozenIndex === -1) {
        frozenIndex = addresses.length;
        // Safe to add, generateLeaves perform a boundary check
        addresses.push(updateAddress);
    } else {
        addresses[frozenIndex] = updateAddress;
    }
    console.log(`frozenIndex: ${frozenIndex}`);
} else {
    if (frozenIndex === -1) {
        throw new Error(`Address ${updateAddress} not found in freeze list`);
    }
    addresses[frozenIndex] = ZERO_ADDRESS;

}

const treeBuilder = new SealanceMerkleTree();
const leaves = treeBuilder.generateLeaves(addresses);
const tree = treeBuilder.buildTree(leaves);
const newRoot = tree[tree.length - 1];
console.log(`New root: ${newRoot}`);
console.log();

// Execute transaction locally
const transaction = await programManager.buildExecutionTransaction({
    programName,
    functionName: "update_freeze_list",
    priorityFee: 0,
    privateFee: false,
    inputs: [
        updateAddress,
        updateAddressStatus.toString(),
        `${frozenIndex}u32`,
        previousRoot,
        `${newRoot}field`,
    ],
    privateKey: account.privateKey(),
    keySearchParams: { "cacheKey": `${programName}:update_freeze_list` },
});

// Submit transaction
const transactionId = await programManager.networkClient.submitTransaction(transaction);

console.log(`Transaction submitted: ${transactionId}`);

let confirmedTransaction;
let retries = 30;

while (retries > 0) {
    try {
        confirmedTransaction = await programManager.networkClient.getTransactionObject(transactionId);
        if (confirmedTransaction) {
            console.log(`Transaction confirmed: ${transactionId}`);
            break;
        }
    } catch (error) {
        console.error(`Transaction confirmation attempt failed: ${error.message}`);
    }

    retries--;
    if (retries > 0) {
        console.log(`Retrying... (${retries} attempts remaining)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
        throw new Error(`Transaction failed to confirm after ${maxRetries} attempts: ${transactionId}`);
    }
}

if (confirmedTransaction.summary().type !== 'execute') {
    throw new Error( `Transaction failed: ${JSON.stringify(confirmedTransaction.summary(true), (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
}
