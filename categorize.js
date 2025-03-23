process.stdout.setEncoding('utf8'); // Enables UTF-8 encoding for text outputted to PowerShell
const fs = require('fs');
const { DirectedGraph } = require('graphology');
const louvain = require('graphology-communities-louvain');
const path = require('path');
// Load the JSON data
let filePath = path.join(__dirname, 'chart.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Create the graph
const graph = new DirectedGraph();

// Add nodes
data.nodes.forEach(node => {
  graph.addNode(node.id, { name: node.Title, category: node.Category });
});

// Add directed edges
data.links.forEach(link => {
  graph.addDirectedEdge(link.source, link.target);
});

// Run Louvain clustering
louvain.assign(graph);

// Update node categories with community IDs
graph.forEachNode(node => {
  const community = graph.getNodeAttribute(node, 'community');
  data.nodes[node].category = community; // Update the category with the community ID
});

// Write the updated JSON back to file
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

console.log(`${filePath.replace(`${__dirname}\\`,"")} categorized`);