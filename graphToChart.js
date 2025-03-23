let removeLoneNodes = true;
process.stdout.setEncoding('utf8'); // Enables UTF-8 encoding for text outputted to PowerShell

const fs = require('fs');
const path = require('path');
let fileIn = path.join(__dirname, 'graph.json');
let fileOut = path.join(__dirname, 'chart.json');

let data = JSON.parse(fs.readFileSync(fileIn, 'utf-8'));
let nodeCount = Object.keys(data).length;
let keyCount = 0;

for (let entry of Object.values(data)) {
    keyCount += entry["Links"].length;
}

let chart = { "nodes": [], "links": [] };

if (removeLoneNodes) {
    let removeKeys = []; // Store nodes to remove
    let dataKeys = Object.keys(data);

    // Identify nodes to remove
    for (let key of dataKeys) {
        if (data[key] && data[key]["Links"].length === 0) {
            removeKeys.push(key);
        }
    }

    // Remove links to nodes being deleted
    for (let key of dataKeys) {
        if (data[key]) { // Ensure node still exists
            data[key]["Links"] = data[key]["Links"].filter(link => !removeKeys.includes(link));
        }
    }

    // Delete nodes
    for (let key of removeKeys) {
        delete data[key];
    }
}

// Assign numeric IDs to nodes
let nodeIndexMap = {};
let index = 0;
for (let key of Object.keys(data)) {
    data[key]["id"] = index;
    nodeIndexMap[key] = index;
    index++;
}

// Create chart nodes
for (let key of Object.keys(data)) {
    let category = data[key]["Category"] || "Uncategorized"; // Default category
    chart["nodes"].push({
        "id": data[key]["id"],
        "name": data[key]["Title"],  // ✅ Uses Title as name
        "category": category
    });

    // Create chart links, ensuring linked nodes exist
    for (let linkKey of data[key]["Links"]) {
        if (nodeIndexMap[linkKey] !== undefined) { // Check if linked node was removed
            chart["links"].push({ "source": data[key]["id"], "target": nodeIndexMap[linkKey] });
        }
    }
}

let newKeyCount = Object.values(data).reduce((sum, entry) => sum + entry["Links"].length, 0);

console.log(`Converted to chart. Nodes: ${nodeCount - Object.keys(data).length} → ${chart["nodes"].length}. Links: ${keyCount - newKeyCount} → ${chart["links"].length}`);

fs.writeFileSync(fileOut, JSON.stringify(chart, null, 2), 'utf-8');
