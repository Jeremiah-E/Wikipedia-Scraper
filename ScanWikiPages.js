// If this gets used on another site, then change isAllowedUrl();

const { join } = require('path');
const { existsSync, readFileSync, writeFileSync } = require('fs');
const { fileURLToPath } = require('url');
const puppeteer = require('puppeteer');
const Bottleneck = require('bottleneck');
const { JSDOM } = require("jsdom");

// Variable initialization
const MAX_FREQUENCY = 7; // Only run up to this many times a second
const BATCH_SIZE = 1;
let numPagesToSearch = parseInt(process.argv[2] == null ? "0" : process.argv[2]);
const filePathRawData = join(__dirname, 'rawData.json');
const altFilePathRawData = join(__dirname, 'resetData.json');
const filePathRedirects = join(__dirname, 'redirects.json');
const filePathDeadlinks= join(__dirname, 'deadlinks.json');
const filePathBlackListedlinks= join(__dirname, 'blacklist.json'); // I want to store all not-allowed links I find out of curiousity
let graph = existsSync(filePathRawData)
    ? JSON.parse(readFileSync(filePathRawData, 'utf-8'))
    : JSON.parse(readFileSync(altFilePathRawData, 'utf-8'));
let redirects = existsSync(filePathRedirects)
    ? JSON.parse(readFileSync(filePathRedirects, 'utf-8'))
    : {};
let deadlinks = existsSync(filePathDeadlinks)
    ? JSON.parse(readFileSync(filePathDeadlinks, 'utf-8'))
    : [];
let blacklist = existsSync(filePathBlackListedlinks)
    ? JSON.parse(readFileSync(filePathBlackListedlinks, 'utf-8'))
    : [];
const colBlue = "\x1b[34m";
const colGrey = "\x1b[90m";
const colRed = "\x1b[31m";
const colGreen = "\x1b[92m";
const colReset = "\x1b[39m";

console.log(`Imported ${colGreen}${Object.keys(graph).length}${colReset} node${plural(Object.keys(graph).length)}, ${colGreen}${Object.values(redirects).reduce((sum, array) => sum + array.length, 0)}${colReset} redirect${plural(Object.values(redirects).reduce((sum, array) => sum + array.length, 0))}, and ${colGreen}${deadlinks.length}${colReset} dead link${plural(deadlinks.length)}`);

/**
 * Given a URL with a potential fragment, remove the fragment
 * @param {String | URL} url Either URL instance or string representing the full URL
 * @returns {String}
 */
function removeFragment(url) {
    if (typeof url == "string") {
        url = new URL(url);
    }
    return `${url.protocol}//${url.host}${url.pathname}`;
}
function isAllowedLink(url) {
    // Convertys url to a string
    if (url instanceof URL) { url = url.toString(); }
    const WL_URL_BASE = "https://en.wikipedia.org/wiki/"
    const BL_SITES = [ "Main_Page" ]
                    .map(site => WL_URL_BASE + site);
    const BL_PREFIXES = ["Portal:", "P:", "Category:", "CAT:", "Talk:", "User_talk:", "Wikipedia_talk:", "File_talk:", "MediaWiki_talk:", "Template_talk:", "Help_talk:", "Category_talk:", "Portal_talk:", "Draft_talk:", "MOS_talk:", "TimedText_talk:", "Module_talk:", "Event_talk:", "Project_talk", "WT_talk", "Image_talk", "Special:", "File:", "Image:", "Media:", ":", "WP:", "Wikipedia:","Project:",  "User:", "Help:", "H:", "Template:", "T:", "Draft:", "MediaWiki:", "Module:"]
                    .map(site => WL_URL_BASE + site);
    if (!url.startsWith(WL_URL_BASE)) {
        blacklist.push(url)
        return false;
    }
    for (site of BL_SITES) {
        if (site == url) {
            blacklist.push(url);
            return false;
        }
    }
    for (prefix of BL_PREFIXES) {
        if (url.startsWith(prefix)) { return false; }
    }
    return true; // Failed no tests
}

/**
 * Returns an array of objects storing { url, html }
 * @param {String[]} urls 
 * @returns {Object}
 */
async function getManyPageHTMLs(urls) {
    const limiter = new Bottleneck({
        minTime: 1000 / MAX_FREQUENCY, // Limits how often to run getPageHTML
        maxConcurrent: BATCH_SIZE,     // At most this many requests at once
    });
    return Promise.all(
        urls.map(url => limiter.schedule(() => getPageHTML(url).then(html => ({ url, html }))))
    );
}
/**
 * Given a URL, returns the old url (.url), new url (.html.url), whether it redirected, and the full HTML content as a string
 * @param {String | URL} url 
 * @returns {{url: String, html: {url: String, redirected: Boolean, text: String}}}}
 */
async function getPageHTML(url) {
    url = removeFragment(url); // Converts to str and removes fragments
    // I tried using fetch(url), but Wikipedia does their redirects through some method fetch() can't get,
    // so I have to use Puppeteer's browser function to do so
    const browser = await puppeteer.launch(); // Create a browser object to interact with the site
    const webpage = await browser.newPage();
    // Go to the url and wait until nothing happens for 500ms. While this does mean there's a 1/2 second delay, this deals with redirects
    await webpage.goto(url, { waitUntil: 'networkidle0' });
    // Desired output format
    const response = {
        url: removeFragment(webpage.url()), // The final URL, after potential redirects
        redirected: url !== removeFragment(webpage.url()), // If the URL changed from the input url
        text: await webpage.content() // Function to get the full HTML content of the page
    };
    const html = response;
    await browser.close();
    return html;
}
function plural(n) {
    return n == 1 ? "" : "s";
}
/**
 * Given a relative URL (link) and a full URL (currentUrl), return link in absolute URL form
 * @param {String} link 
 * @param {String | URL} currentUrl 
 * @returns string
 */
function processLink(link, currentUrl) { 
    if (currentUrl instanceof URL) { currentUrl = currentUrl.toString(); } // Ensures it's a string
    const urlObj = new URL(currentUrl);
    const BASE_DOMAIN = `${urlObj.protocol}//${urlObj.host}`;
    // With BASE_DOMAIN initialized, process the link
    if (link.startsWith("/")) {
        // Convert any relative path to an absolute path
        return new URL(link, BASE_DOMAIN).toString();
    } else if (link.startsWith("#") || link.startsWith("about:blank#")) {
        // Treat fragments (#) and about:blank# as pointing to the current URL
        const fragment = link.startsWith("about:blank#") ? link.slice("about:blank".length) : link;
        return `${currentUrl}${fragment}`;
    }
    return link;
}


if (numPagesToSearch > Object.keys(graph).length) {
    console.warn(`Warning: The input JSON was too short. Searching through ${Object.keys(graph).length} article${plural(Object.keys(graph).length)} instead`)
    numPagesToSearch = Object.keys(graph).length;
}
// Array of urls to search
let pagesToSearch = Object.entries(graph)  // Convert object to array of [key, value] pairs
        .sort((a, b) => a[1].Updates - b[1].Updates)  // Sort by "Updates" value
        .slice(0, numPagesToSearch)  // Take the first n elements (smallest "Updates" values)
        .map(entry => entry[0]);  // Extract the keys

(async () => {
    const htmls = await getManyPageHTMLs(pagesToSearch.map(url => url));
    console.log(`Loaded HTML content of ${Object.keys(htmls).length} page${plural(Object.keys(htmls).length)}`);
    // Add redirects to redirects
    for (let i = 0; i < htmls.length; i++) {
        let html = htmls[i];
        // Is redirect
        if (html.html.redirected) {
            const relativeUrl = html.url;
            const redirectUrl = html.html.url;
            // Does not exist in redirect
            if (!redirects[redirectUrl]) {
                redirects[redirectUrl] = []; // Initialize if not present
            }
            // Add value to redirect if not there already
            if (!redirects[redirectUrl].includes(relativeUrl)) {
                redirects[redirectUrl].push(relativeUrl); // Add redirect
            }
        }
    }
    for (let i in htmls) {
        // Resolves redirects and removes fragments
        htmls[i].url = removeFragment(htmls[i].html.url);
        // Converts text to HTMLCollections object
        // Also moves the information up a layer as redirected and url aren't needed here anymore
        const dom = new JSDOM(htmls[i].html.text);
        htmls[i].html = dom.window.document;
    }
    // Deduplicate based on url / TODO: Replace with filter to reduce O(n²) to O(n)
    for (let i = 0; i < htmls.length; i++) {
        if (i != htmls.findIndex(html => html.url === htmls[i].url)) {
            htmls.splice(i, 1);
            i--; // We removed this value, so i must decrease to counter the i++ at the end of the loop
        }
    }
    // We begin processing the articles
    let links = {}; // {url: [links], url: [links], . . . }
    let titles = {};
    process.stdout.write(`Article${plural(htmls.length)} scanned:`);
    for (let i = 0; i < htmls.length; i++) {
        const lastPage = i == htmls.length - 1;
        let page = htmls[i];
        let url = page.url;
        let html = page.html;
        titles[url] = html.querySelector("title").textContent.replace(" - Wikipedia", "");
        // Log if this is a dead link, then break
        // Look for "no article exists" div
        let articleExists = !html.querySelector('.mw-noarticletext');
        if (articleExists) {
            // Grab all links from page
            links[url] = Array.from(html.querySelectorAll("a")).map(link => link.href); // Pull all links from page
            // Fixes links. Many links are relative, so this converts them all to absolute links
            // processLink("/wiki/boat","https://en.wikipedia.org/wiki/Folly_Boat") → "https://en.wikipedia.org/wiki/boat"
            links[url] = links[url].map(link => processLink(link, url));
            // Sorts values. Not needed, but output looks nicer
            links[url] = links[url].sort();
            // Remove blacklisted links
            links[url] = links[url].filter(link => isAllowedLink(link));
            // Removes fragments (the part after a #)
            // "https://en.wikipedia.org/wiki/Folly_Boat#cite_ref-8" → "https://en.wikipedia.org/wiki/Folly_Boat"
            links[url] = links[url].map(link => removeFragment(link));
            // Deduplicate links
            links[url] = [... new Set(links[url])];
            // Printing what we scanned
        } else {
            deadlinks.push(url);
        }
        let col = articleExists ? colBlue : colRed;
        if (lastPage && htmls.length != 1) { process.stdout.write(" and"); }
        process.stdout.write(` ${col}${titles[url]}${colReset}`);
        if (!lastPage) { process.stdout.write(","); } // Delineator
        else { process.stdout.write("\n"); } // Newline at the end of the prints
    }
    if (Object.keys(links).length != numPagesToSearch) {
        console.log(`${colGrey}Note: Some articles were not done due to either redirects merging multiple pages, catching a dead link, or a short input JSON${colReset}`);
    }
    function resolveRedirect(url) {
        for (const [target, alaisList] of Object.entries(redirects)) {
            if (alaisList.includes(url)) {
                return target;
            }
            
        }
        return url; // Found no redirect. Returning original url
    }
    // Loop through links. If the item is in redirects, change the value
    for (const [url, linkList] of Object.entries(links)) {
        links[url] = linkList.map(link => resolveRedirect(link));
    }
    // Do the same with graph
    for (const [url, data] of Object.entries(graph)) {
        graph[url].Links = data.Links.map(link => resolveRedirect(link));
    }
    // Rewrite the data for graph
    for (const [url, linkList] of Object.entries(links)) {
        for (let [node, entry] of Object.entries(graph)) {
            if (node in links) {
                // Update everything
                graph[node].Title = titles[node];
                graph[node].Links = links[node];
                graph[node].Updates = 1;
            }
            // If redirect, delete old node and create new
            if (node != resolveRedirect(node)) {
                graph[resolveRedirect(node)] = graph[node];
                delete graph[node];
            }
        }
        for (let link of linkList) {
            if (!graph[link]) {
                graph[link] = {
                    Title: link,
                    Updates: 0,
                    Links: [],
                }
            }
        }
    }
    // Overwrite redirects, deadlinks, and rawData
    writeFileSync(filePathRedirects       , JSON.stringify(redirects, null, 2), 'utf8');
    writeFileSync(filePathDeadlinks       , JSON.stringify(deadlinks, null, 2), 'utf8');
    writeFileSync(filePathRawData         , JSON.stringify(graph    , null, 2), 'utf8');
    blacklist = [... new Set(blacklist)]; // Deduplicate blacklist
    // This file isn't needed, just felt curious about what links I discard
    writeFileSync(filePathBlackListedlinks, JSON.stringify(blacklist, null, 2), 'utf8');
    console.log(`Exported ${colGreen}${Object.keys(graph).length}${colReset} node${plural(Object.keys(graph).length)}, ${colGreen}${Object.values(redirects).reduce((sum, array) => sum + array.length, 0)}${colReset} redirect${plural(Object.values(redirects).reduce((sum, array) => sum + array.length, 0))}, and ${colGreen}${deadlinks.length}${colReset} dead link${plural(deadlinks.length)}`);
})();
