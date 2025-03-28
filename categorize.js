process.stdout.setEncoding('utf8'); // Enables UTF-8 encoding for text outputted to PowerShell
const fs = require('fs');
const { DirectedGraph } = require('graphology');
const louvain = require('graphology-communities-louvain');
const path = require('path');

// Load the JSON data
let filePath = path.join(__dirname, 'chart.json');
let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Create the graph
let graph = new DirectedGraph();

// Add nodes. Here data.Nodes is an object mapping node IDs to their data.
Object.entries(data.Nodes).forEach(([id, node]) => {
  // Note: if Category doesn't exist in the JSON, default to null.
  graph.addNode(id, { name: node.Title, category: node.Category || null });
});

// Add directed edges. In the JSON, each link is an array [source, target].
data.Links.forEach(link => {
  const [source, target] = link;
  if (!graph.hasDirectedEdge(source, target)) {
    graph.addDirectedEdge(source, target);
  }
});

// Remove duplicate edges from the data.
// Ideally these would be removed earlier, but duplicates still make it here.
const uniqueLinks = [];
const linkSet = new Set();

data.Links.forEach(link => {
  const edgeKey = `${link[0]}-${link[1]}`;
  if (!linkSet.has(edgeKey)) {
    linkSet.add(edgeKey);
    uniqueLinks.push(link);
  }
});
data.Links = uniqueLinks;

// Run Louvain clustering
louvain.assign(graph);

// Update node categories with community IDs
graph.forEachNode((node, attributes) => {
  const community = attributes.community;
  // Update the Category for the node in our JSON data
  data.Nodes[node].Category = community;
});

// Write the updated JSON back to file
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

console.log(`${filePath.replace(`${__dirname}${path.sep}`, "")} categorized`);
