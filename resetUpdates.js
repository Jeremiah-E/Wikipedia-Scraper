let fs = require("fs");
let path = require("path");

const redirects = {};
const deadlinks = [];
let data = fs.readFileSync(path.join(__dirname, 'graph.json'), 'utf-8');

for (let i = 0; i < Object.keys(data).length; i++) {
    data[Object.keys(data)[i]].Updates = 0;
}

fs.writeFileSync(path.join(__dirname, 'redirects.json'), JSON.stringify(redirects, null, 2), 'utf-8');
fs.writeFileSync(path.join(__dirname, 'deadlinks.json'), JSON.stringify(deadlinks, null, 2), 'utf-8');
fs.writeFileSync(path.join(__dirname, 'graph.json'),     JSON.stringify(data,      null, 2), 'utf-8');

console.log("Redirects purged, deadlinks purged, graph update counters reset");