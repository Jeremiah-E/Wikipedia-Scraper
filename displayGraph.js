// Global variables
let svg = document.getElementById("wiki_graph");
let isPanning = false;
let startX, startY;
let viewBox = svg.viewBox.baseVal;

function numToColor(n) {
  let col = [
    "Red", "Purple", "Blue", "Green", "Yellow", "Orange", "Brown",
    "DarkRed", "DarkBlue", "DarkGreen", "DarkMagenta", "DarkOrange", "DarkSlateGray",
    "MediumVioletRed", "MidnightBlue", "RebeccaPurple", "Teal"
  ];

  n = n % col.length;
  col = col[n];
  return col;
}

// Useful functions
function circle(x, y, diameter = 1, fill = "black", title="Error, No Title Provided", link="https://en.wikipedia.org/wiki/Main_Page") {
  // Creates an ID so that the circle can communicate with the text element
  const textId = `tooltip-${title.replace(/\s+/g, "_").replace(/[^\w-]/g, "")}`;
  // Also add a link to the Wikipedia page
  return `
    <a target="_blank" href="${link}"><circle r="${diameter / 2}" cx="${x}" cy="${y}" fill="${fill}"
      onmouseover="showTooltip(event, &quot;${title}&quot;, &quot;${textId}&quot;)"
      onmouseout="hideTooltip('${textId}')">
    </circle></a>
  `;
}
function line(x1, y1, x2, y2, fill="grey", strokeWidth="0.1") {
  let str = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${fill};stroke-width:${strokeWidth}"/>`;
  return str;
}
function assembleHTMLString(data) {
  let str = ``;
  let nodeKeys = [];
  for (let i = 0; i < Object.keys(data.Nodes).length; i++) {
    nodeKeys.push(i);
  }
  let nodes = data.Nodes;
  let links = data.Links;
  for (let link of links) {
    str += line(nodes[`${link[0]}`].Pos[0], nodes[`${link[0]}`].Pos[1],   // Node of index 0
                nodes[`${link[1]}`].Pos[0], nodes[`${link[1]}`].Pos[1]);  // Node of index 1
  }
  for (let i of nodeKeys) {
    let node = data.Nodes[i];
    str += circle(node.Pos[0], node.Pos[1], 1, numToColor(node.Category), node.Title, node.url);
  }
  return str;
}
// Creates a function that can be called from the window
window.showTooltip = function (evt, text, id) {
  let svg = evt.target.closest('svg');
  if (!svg) return;

  let existingText = document.getElementById(id);
  if (!existingText) { // Checks if the text element exists already
    let tooltip = document.createElementNS("http://www.w3.org/2000/svg", "text");
    tooltip.setAttribute("id", id);
    tooltip.setAttribute("x", evt.target.getAttribute("cx"));
    tooltip.setAttribute("y", evt.target.getAttribute("cy") - 2/3); // Slightly above the circle
    tooltip.setAttribute("paint-order", "stroke fill");
    tooltip.setAttribute("text-anchor", "middle");
    tooltip.setAttribute("font-size", `1`);
    tooltip.setAttribute("fill", "black");
    tooltip.setAttribute("stroke", "white"); // Make the text visible
    tooltip.setAttribute("stroke-width", "0.01");
    tooltip.innerHTML = text;
    svg.appendChild(tooltip);
  }
};
window.hideTooltip = function (id) {
  let tooltip = document.getElementById(id);
  if (tooltip) {
    tooltip.remove();
  }
};


// Initial code
// Get width, height of the svg
let w = svg.getBoundingClientRect().width;
let h = svg.getBoundingClientRect().height;
let initialZoom = 10;
// Set initial viewbox to get a good view of the initial setup
if (w < h) {
  // Divide both by w, multiply by default zoom
  h *= initialZoom / w; w *= initialZoom / w;
  svg.setAttribute("viewBox", `${-w/2} ${-h/2} ${w} ${h}`);
} else {
  // Divide both by h, multiply by default zoom
  w *= initialZoom / h; h *= initialZoom / h;
  svg.setAttribute("viewBox", `${-w/2} ${-h/2} ${w} ${h}`);
}
// Main code
let data;
fetch('./chart.json')
  .then(response => response.json())
  .then(json => {
    data = json;
    // As soon as the chart loads, this code will run
    console.log(`Imported chart with ${Object.keys(data.Nodes).length} Nodes and ${data.Links.length} Links`);
    let keys = [];
    for (let i = 0; i < Object.keys(data.Nodes).length; i++) {
      keys.push(i);
    }
    data = initNodes(data);
    svg.innerHTML = assembleHTMLString(data);
    return data;
})
  .catch(error => console.error('Error loading the chart:', error));

function initNodes(data) {
  let keys = [];
  for (let i = 0; i < Object.keys(data.Nodes).length; i++) {
    keys.push(i);
  }
  let radius = keys.length / 3;
  let n = keys.length;
  let shape = "spiral"; // circle, spiral
  for (let i = 0; i < keys.length; i++) {
    if (shape == "circle") {
      data.Nodes[i].Pos = [radius * Math.cos(2 * Math.PI * i / n), radius * Math.sin(2 * Math.PI * i / n)];
    } else if (shape == "spiral") {
      let dist = Math.log(i + 1) / Math.log(Math.PI) // Log base pi
      dist += 1; // Spaces out the nodes
      dist *= 2;
      //dist *= n; // Spaces out the nodes
      data.Nodes[i].Pos = [dist * Math.cos(2 * Math.PI * i / n), dist * Math.sin(2 * Math.PI * i / n)];
    }
  }
  return data;
}
function getVector(v1, v2) {
  return [v1[0] - v2[0], v1[1] - v2[1]];
}
function getMagnitude(vector) {
  return Math.sqrt(vector[0] ** 2 + vector[1] ** 2);
}
function getUnitVector(v1, v2) {
  let vector = getVector(v1, v2);
  let mag = getMagnitude(vector);
  mag = mag == 0 ? 1 : mag; // Sets mag to 1 if it would break everything. Since mag is only 1 when the vector is 0,0, nothing bad happens now
  return [vector[0] / mag, vector[1] / mag]
}
function force(v1, v2, linked = true) {
  let vector = getVector(v1, v2);
  let mag = getMagnitude(vector);
  if (mag === 0) { return [0, 0]; } // Prevent errors for overlapping nodes
  let unitVector = getUnitVector(v1, v2);
  if (linked) { // If the nodes are connected by a link, treat it as a fairly rigid spring
    let restLength = 10; // Desired equilibrium distance
    let stiffness = 0.005; // Spring stiffness
    let forceMagnitude = stiffness * (restLength - mag); // Hooke's Law
    // Return forceMagnitude with direction unitVector
    return [unitVector[0] * forceMagnitude, unitVector[1] * forceMagnitude];
  }
  // If the nodes are not linked, repel them, *especially* if they are close together
  let repulsionStrength = -.001;
  let sigmoid = 1 / (1 + Math.exp(-5 * mag))
  let forceMagnitude = repulsionStrength * sigmoid;
  return [-unitVector[0] * forceMagnitude, -unitVector[1] * forceMagnitude];
}
window.updatePositions = function() { // Run each time ' ' is pressed
  let nodes = data.Nodes; // Each node has a .Pos, wwhich contains a [x, y] value
  let links = data.Links; // Each link is [origin, target]
  let sumForces = [0, 0];
  let linksToNodes = [];
  // Get number of links to and from each ID
  let maxIndex = 0;
  for (let link of links) {
    maxIndex = Math.max(maxIndex, link[0], link[1]);
  }
  for (let i = 0; i <= maxIndex; i++){
    linksToNodes[i] = 0;
  }
  for (let link of links) {
    linksToNodes[link[0]]++;
    linksToNodes[link[1]]++;
  }
  // Loop through links to get all of the linked connections
  for (let link of links) {
    let i = link[0];
    let j = link[1];
    let v = force(nodes[i].Pos, nodes[j].Pos, true);
    // Move the two nodes
    nodes[i].Pos = [nodes[i].Pos[0] + v[0], nodes[i].Pos[1] + v[1]]; // Move i → j
    nodes[j].Pos = [nodes[j].Pos[0] - v[0], nodes[j].Pos[1] - v[1]]; // Move j → i
  }
  // Loop through nodes to apply the unlinked force
  for (let i = 0; i < Object.keys(nodes).length; i++) {
    for (let j = 0; j < Object.keys(nodes).length; j++) {
        if(i != j) {
          let v = force(nodes[i].Pos, nodes[j].Pos, false, linksToNodes[i], linksToNodes[j]); // Extra argument for unlinked nodes
          sumForces = [sumForces[0] + v[0], sumForces[1] + v[1]];
          nodes[i].Pos = [nodes[i].Pos[0] + v[0], nodes[i].Pos[1] + v[1]];
        }
    }
  }
  //console.log(`Net force: ${sumForces}`)
  data.Nodes = nodes;
  svg.innerHTML = assembleHTMLString(data);
}

// Event Listeners

// Zoom when scrolled
svg.addEventListener("wheel", (event) => {
  event.preventDefault();
  let scaleFactor = event.deltaY > 0 ? 1.1 : 0.9;

  let mouseX = event.offsetX;
  let mouseY = event.offsetY;

  let newWidth = viewBox.width * scaleFactor;
  let newHeight = viewBox.height * scaleFactor;

  // Calculate the relative position of the mouse within the viewBox
  let relativeMouseX = viewBox.x + (mouseX / svg.getBoundingClientRect().width) * viewBox.width;
  let relativeMouseY = viewBox.y + (mouseY / svg.getBoundingClientRect().height) * viewBox.height;

  // Calculate the new viewBox origin to keep the mouse point fixed
  let newX = relativeMouseX - (mouseX / svg.getBoundingClientRect().width) * newWidth;
  let newY = relativeMouseY - (mouseY / svg.getBoundingClientRect().height) * newHeight;

  svg.setAttribute("viewBox", `${newX} ${newY} ${newWidth} ${newHeight}`);

  viewBox = svg.viewBox.baseVal;
  console.log(`Δx: ${Math.floor(dx)}, Δy: ${Math.floor(dy)},  Width: ${Math.floor(newWidth)}, Height: ${Math.floor(newHeight)}`);
});

// Pan when dragged
svg.addEventListener("mousedown", (event) => {
  isPanning = true;
  startX = event.clientX;
  startY = event.clientY;
});

svg.addEventListener("mousemove", (event) => {
  if (!isPanning) return;
  let dx = ((event.clientX - startX) / svg.clientWidth) * viewBox.width;
  let dy = ((event.clientY - startY) / svg.clientHeight) * viewBox.height;
  viewBox.x -= dx;
  viewBox.y -= dy;
  startX = event.clientX;
  startY = event.clientY;
});

svg.addEventListener("mouseup", () => {
  isPanning = false;
});

svg.addEventListener("mouseleave", () => {
  isPanning = false;
});

let isRunning = false;
let animationFrameId;

function runUpdatePositions() {
  if (isRunning) {
    updatePositions();
    animationFrameId = requestAnimationFrame(runUpdatePositions);
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    event.preventDefault();
    isRunning = !isRunning; // Toggle the boolean

    if (isRunning) {
      runUpdatePositions();
    } else {
      cancelAnimationFrame(animationFrameId);
    }
  }
});
