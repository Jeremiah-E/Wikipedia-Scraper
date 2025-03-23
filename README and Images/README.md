# Viewing the Graph

*All ps1 files mentioned are located in the folder `Important Scripts`.*

Run `server.ps1` in PowerShell. While running, going to [https://localhost:8000](http://localhost:8000) shows the graph. Running the server while the graph is building or empty will not break anything.

![Example of builder.ps1 running](localhostexample.png)

# Building / Editing the Graph

*All ps1 files mentioned are located in the folder `Important Scripts`.*

Run `builder.ps1` to edit the JSON file

When running `builder.ps1`, it will ask you for a number. It will then loop through that many articles and log every link on their page.

![Example of builder.ps1 running](builderexample.png)

Here, the graph will now include `2002`, `Web_traffic`, `United_States`, `Japan`, and the `United_Kingdom`. If you load [localhost](https://localhost:8000), the graph will contain all five nodes, among those previously built. If you look at the image at the top of the page, you will see the `United States` article is present.

*(While technically you **could** directly build it yourself by manually entering JSON code, having the `builder.ps1` file do it is infinitely easier, as each article often has hundreds of outgoing links. Just here, 6000 links were entered.)*

# Resetting the Graph

Delete `redirects.json`, `deadlinks.json`, and `graph.json`

To determine the single unparsed node you start with, edit `resetGraph.json` (By default, it directs `graph.js` to parse [Wikipedia](https://www.wikipedia.org/wiki/wikipedia))

## Warning

**If you do not have Node JS or these modules, then the code will not run properly.**

*(These lines can be pasted into PowerShell or Terminal. Only run the first two lines if you don't have Node JS):*

```
winget install Schniz.fnm
fnm install 22
npm install graphology-communities-louvain
npm install graphology
npm install puppeteer
npm install jsdom
```