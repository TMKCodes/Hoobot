const delay = (
  ms: number
) => {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

// The base URL of the API
const baseUrl = 'https://api.nexell-ia.net/blocks/';

// Function to fetch block data by blockId
async function fetchBlock(blockId: string): Promise<any> {
    const response = await fetch(`${baseUrl}${blockId}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

// Function to fetch the Nth child block starting from a given blockId
async function fetchNthChildBlock(startBlockId: string, n: number): Promise<void> {
    let currentBlockId = startBlockId;
    for (let i = 0; i < n; i++) {
        try {
            const blockData = await fetchBlock(currentBlockId);
            if (blockData.verboseData.childrenHashes.length === 0) {
                console.log(`No child found for block ${currentBlockId}. Ending search.`);
                return;
            }
            // Assuming the first child in the array is the next block
            currentBlockId = blockData.verboseData.childrenHashes[0];
            console.log(`Moved to child block: ${i} ${currentBlockId}`);
        } catch (error) {
            console.error(`An error occurred: ${error}`);
            return;
        }
    }
    console.log(`Reached the ${n}th child block: ${currentBlockId}`);
    delay(500);
}

// Example usage: Fetch the 10,000th child block starting from a specific blockId
const startBlockId = 'ccdbf69965e58b6b994464b847e66b76a5043663c8c4f9aaf194ae01e4db5f4e';
const n = 10000; // The Nth child to fetch
fetchNthChildBlock(startBlockId, n).then(() => console.log('Finished processing.'));