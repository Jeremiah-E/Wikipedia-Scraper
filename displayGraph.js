var filePath = "chart.json";
var margin = { top: 10, right: 30, bottom: 30, left: 40 };
var width = window.innerWidth - margin.left - margin.right;
var height = window.innerHeight - margin.top - margin.bottom;
var linkColor = "#aaa";
var nodeColor = "#69b3a2";

var svg = d3.select("#wiki_graph")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .call(d3.zoom()
        .scaleExtent([0.01, 10])
        .on("zoom", zoomed))
    .append("g");

function zoomed(event) {
    svg.attr("transform", event.transform);
}
let colorScale = d3.scaleOrdinal(d3.schemeCategory10); // Uses a set of 10 distinct colors

let chart = { "nodes": [], "links": [] };

d3.json(filePath).then(function (data) {
    chart = data;

    // Map categories to colors using the color scale
    let categoryArray = [1];
    colorScale.domain(categoryArray);

    var link = svg.selectAll("line")
        .data(chart.links)
        .enter()
        .append("line")
        .style("stroke", linkColor);

    var node = svg.selectAll("g")
        .data(chart.nodes)
        .enter()
        .append("g")
        .call(d3.drag()
            .on("start", dragStarted)
            .on("drag", dragged)
            .on("end", dragEnded));

    // Append circles with color based on category
    node.append("circle")
        .attr("r", 20)
        .style("fill", d => colorScale(d.category)) // Assign color based on category
        .on("mouseover", function (event, d) {
            d3.select(this.parentNode).select("text").style("visibility", "visible");
            d3.select(this).attr("stroke", "black").attr("stroke-width", 3); // Highlight on hover
        })
        .on("mouseout", function (event, d) {
            d3.select(this.parentNode).select("text").style("visibility", "hidden");
            d3.select(this).attr("stroke", "none"); // Remove highlight
        });

    // Append hidden text for node labels
    node.append("text")
        .attr("x", 25)
        .attr("y", 5)
        .attr("font-size", "14px")
        .attr("fill", "black")
        .style("visibility", "hidden")
        .text(d => d.name);

    var simulation = d3.forceSimulation(chart.nodes)
        .force("link", d3.forceLink(chart.links).id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .on("tick", ticked);

    function ticked() {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    }

    function dragStarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragEnded(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    simulation.alpha(1).restart();
});