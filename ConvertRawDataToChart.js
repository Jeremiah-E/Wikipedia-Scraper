// My first attempt at coding this was O(n^3). This is a mroe optimized O(n^3), but still cubic
// Given n=7,000,000 near the end of this project, I need a decent O() value
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const filepathInput = join(__dirname, 'rawData.json');
const filepathOutput = join(__dirname, 'chart.json');
const colGreen = "\x1b[92m";
const colReset = "\x1b[39m";

let NodeToId = {}; // String → Number
let IdToNode = []; // Number → String

let data = JSON.parse(readFileSync(filepathInput, 'utf-8'));
let chart = {Nodes: {}, Links: []}
console.log(`Imported rawData.json with ${colGreen}${Object.keys(data).length}${colReset} nodes and ${colGreen}${Object.keys(data).length}${colReset} links`);
let dataKeys = Object.keys(data);
let nodesToDelete = [];
// Remove unparsed nodes. Not needed but allows for the data to be cleaner
// as you don't have a million links towards stuff the graph has no information on
for (let i = 0; i < dataKeys.length; i++) {
    if (data[dataKeys[i]].Links.length == 0) {
        // If no outgoing nodes, delete the key
        nodesToDelete.push(dataKeys[i]);
        delete data[dataKeys[i]];
        // Deletion doesn't mess up iteration because dataKeys doesn't change
    }
}
dataKeys = Object.keys(data); // Reset dataKeys since data changed
// Make a map so that I can reduce looping
for (let i = 0; i < dataKeys.length; i++) {
    IdToNode[i] = dataKeys[i];
    NodeToId[dataKeys[i]] = i;
}
for (let i = 0; i < dataKeys.length; i++) {
    let dataKey = dataKeys[i];
    data[dataKey].Links = data[dataKey].Links.filter(link => data[link] !== undefined);
}
// Now that data's processed, let's build chart
for (let i = 0; i < dataKeys.length; i++) {
    let dataKey = dataKeys[i];
    let links = data[dataKey].Links;
    // Create title, position, and url of nodes
    let ind = i / dataKeys.length * 2 * Math.PI;
    chart.Nodes[i] = {Title: data[dataKey].Title, Pos: [Math.cos(ind), Math.sin(ind)], url: dataKey};
    // Create links
    for (let link of links) {
        chart.Links.push([NodeToId[link], NodeToId[dataKey]]);
    }
}
writeFileSync(filepathOutput, JSON.stringify(chart, null, 2), 'utf8');
console.log(`Exported chart.json with ${colGreen}${Object.keys(chart.Nodes).length}${colReset} nodes and ${colGreen}${Object.keys(chart.Links).length}${colReset} links`);
