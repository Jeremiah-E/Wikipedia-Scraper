process.stdout.setEncoding('utf8'); // Enables UTF-8 encoding for text outputted to PowerShell
const arg = parseInt(process.argv[2], 10); // Second argument from console. First argument is this file
const fs = require('fs');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { JSDOM } = require('jsdom');
const path = require('path');
// ANSI escape codes to color console output
const colBlue = "\x1b[34m";
const colGrey = "\x1b[90m";
const colGreen = "\x1b[92m";
const colReset = "\x1b[39m";

const BATCH_SIZE = 5; // Max number of puppeteer instances scraping Wikipedia at once

// Pull data from either graph.json or resetGraph.json, prioritizing graph.json
let filePath1 = path.join(__dirname, 'graph.json');
let data = fs.existsSync(filePath1)
  ? JSON.parse(fs.readFileSync(filePath1, 'utf-8'))
  : JSON.parse(fs.readFileSync(path.join(__dirname, 'resetGraph.json'), 'utf-8'));

// Pull redirects from redirects.json or use an empty object as the default
let filePath2 = path.join(__dirname, 'redirects.json');
let redirectsFromFile = fs.existsSync(filePath2)
  ? JSON.parse(fs.readFileSync(filePath2, 'utf-8'))
  : {};

// Pull dead links from deadlink.json or use an empty array as the default
let filePath3 = path.join(__dirname, 'deadlinks.json');
let deadlinks = fs.existsSync(filePath3)
  ? JSON.parse(fs.readFileSync(filePath3, 'utf-8'))
  : [];

console.log(`Imported ${colGreen}${Object.keys(data).length}${colReset} nodes, ${colGreen}${Object.keys(redirectsFromFile).length}${colReset} redirects, and ${colGreen}${deadlinks.length}${colReset} dead links`);

// Given a partial URL (everything after /wiki/), return a full URL, https:// and all
function getWikiStr(url) {
    return `https://en.wikipedia.org/wiki/${url}`;
}

//Given a full URL, return a partial  URL (everything after /wiki/)
function getPartialURL(url) {
    if (url instanceof URL) {
        url = url.toString(); // Converts url to a string so we can perform string operations on it
    }
    try {
        return decodeURIComponent(url.replace("https://en.wikipedia.org/wiki/", ""));
    } catch (e) {
        console.warn(`Warning: Malformed URL detected - ${url}`);
        return url.replace("https://en.wikipedia.org/wiki/", ""); // Return as-is if decoding fails
    }
}

function resolveHash(url) {
    if (typeof url === "string") {
        url = new URL(getWikiStr(url));
    }
    return `${url.protocol}//${url.host}${decodeURI(url.pathname)}`;
}

// Returns if it is a Wikipedia page I do not want included in the graph
function isBlacklistedURL(str) {
    // https://en.wikipedia.org/wiki/Wikipedia:What_is_an_article%3F applies to all but blacklistedArticle, which is excluded for being unencyclopedid
    const blacklistedArticle = new Set([
        "Main_Page"
    ]);
    const blacklistNamespaces = [
        "Portal:", "P:", "Category:", "CAT:", "Talk:", "User_talk:", "Wikipedia_talk:", "File_talk:", "MediaWiki_talk:", "Template_talk:", "Help_talk:", "Category_talk:", "Portal_talk:", "Draft_talk:", "MOS_talk:", "TimedText_talk:", "Module_talk:", "Event_talk:", "Project_talk", "WT_talk", "Image_talk", "Special:", "File:", "Image:", "Media:", ":", "WP:", "Wikipedia:","Project:",  "User:", "Help:", "H:", "Template:", "T:", "Draft:", "MediaWiki:", "Module:"
    ];
    return blacklistedArticle.has(str) || blacklistNamespaces.some(prefix => str.startsWith(prefix));
}

// Gets the HTML of a page given a full URL
async function getPageHTML(url) {
    if (url instanceof URL) url = url.toString();
    await delay(500); // 1/2-second delay before fetching to comply with https://wikitech.wikimedia.org/wiki/Robot_policy
    // Launch a new browser
    const browser = await puppeteer.launch({ headless: "new" });
    // Launch a tab
    const page = await browser.newPage();
    try {
        // Change the tab's URL to url and wait for the document to load
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        // Gets the url after loading and cleans it up - Deals with (most) redirects and all headers (portions of URLs after a #, tells where on the page to go)
        const actualUrl = resolveHash(getPartialURL(page.url()));
        const content = await page.evaluate(() => document.documentElement.outerHTML);
        await browser.close(); // Close browser when done
        return { result: content, actualUrl };
    } catch (error) {
        console.error(`Error fetching ${url}: ${error.message}`);
        await browser.close();
        return { result: null, actualUrl: null };
    }
}

function mergeData(newData) {
    for (const [key, value] of Object.entries(newData)) {
        if (!data[key]) {
            data[key] = value;
        } else {
            // Filter out outdated links that were redirected
            let updatedLinks = value.Links.map(link => resolveRedirect(link));

            data[key].Links = [...new Set(updatedLinks)];
            data[key].Updates = Math.max(data[key].Updates, value.Updates);
            data[key].Category = 0;

            data[key].Title = [data[key].Title, value.Title].sort((a, b) => 
                Object.values(data).filter(v => v.Title === a).length - 
                Object.values(data).filter(v => v.Title === b).length
            )[0];
        }
    }
}


function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Sanitizes a string
// A '%_r' in a URL broke everything, so this code should convert any potentially dangerous characters (like %) into an escape code
function safeString(str) {
    try {
        return decodeURI(str).replace(/[\n\r\t]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    } catch (e) {
        // Find the first unsafe character by checking for un-decodable percent-encoded sequences
        let unsafeChar = str.match(/%[0-9A-Fa-f]{2}/) || str.match(/[^A-Za-z0-9 _\-.:/]/);
        let sanitizedStr = str.replace(/[\n\r\t]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        console.warn(`${str} → ${sanitizedStr} due to unsafe character '${unsafeChar}'`);
        return sanitizedStr;
    }
}

// This function checks if the provided link exactly matches any alias in redirectsFromFile
// and returns the canonical target if so. (It does not perform case-insensitive matching.)
function resolveRedirect(link) {
    let resolved = link;
    let seen = new Set(); // List of links seen. If we hit the same link twice, we hit a loop
  
    // Loop until no more redirection is found or a cycle is detected

    // Double or even triple redirects are rare and fixed by bots after a few hours, but a few hours window to
    // hit a double redirect when going over 7m articles is bigger than I'd like it to be
    while (true) {
      if (seen.has(resolved)) {
        // Cycle detected, break to avoid an infinite loop
        seen = [... seen]; // Convert to array
        let str = "Warning: Circular redirect found\n";
        // Really cool looking visualization of the links. If the code went up in flames, I might as well have fun coding how to show it did
        let maxLength = Math.max(...seen.map(num => num.toString().length));
        for (let i = 0; i < seen.length; i++) {
            let numStr = getWikiStr(`${seen[i]}`); // Convert to string just in case, then full URL
            let padding = " ".repeat(maxLength - seen[i].toString().length);
            let isEven = seen.length % 2 === 0;
            let extraSpace = (isEven && i === seen.length - 1) ? "" : "  ";
    
            if (i === 0) {
                str += `╭►${numStr}${padding}─╮\n`;
            } else if (i === seen.length - 1) {
                str += `╰─${numStr}${padding}${extraSpace}◂╯\n`;
            } else if (i % 2 === 1) {
                str += `│ ${numStr}${padding}◂╯─╮\n`;
            } else {
                str += `│ ${numStr}${padding}─╮◂╯\n`;
            }
        }
    
        console.warn(str);
        break;
      }
      seen.add(resolved);
  
      let foundRedirect = false;
      for (const target in redirectsFromFile) {
        // If the target is the same as our current link, no change
        if (target === resolved) {
          // The current link is already canonical, so we don't change it.
          continue;
        }
        const aliases = redirectsFromFile[target];
        if (aliases.includes(resolved)) {
          // Found a redirection, update and break to check for further redirects
          resolved = target;
          foundRedirect = true;
          break;
        }
      }
      if (!foundRedirect) {
        // No further redirection found
        break;
      }
    }
    return resolved;
  }

async function fetchBatch(articles) {
    let results = [];
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
        const batch = articles.slice(i, i + BATCH_SIZE).map(name => getPageHTML(getWikiStr(encodeURIComponent(name))));
        results.push(...(await Promise.all(batch)));
    }
    return results;
}

async function updateGraph() {
    let articleNames = Object.keys(data)
        .sort((a, b) => data[a].Updates - data[b].Updates)
        .slice(0, arg);
    
    const results = await fetchBatch(articleNames);
    
    let newData = {};
    let titleDict = {}; // Dictionary to map node names to correct titles. Used so getting the title can work in parallell

    results.forEach(({
        result,
        actualUrl
    }, index) => {
        if (!result) return; // Skip failed fetches
        
        let doc = new JSDOM(result).window.document;
        let pageTitle = safeString(doc.title.replace(" - Wikipedia", ""));
        let articleName = safeString(articleNames[index]); // Requested name from dataset
        let resolvedName = getPartialURL(actualUrl); // Canonical target from the actual URL


        if (articleName in deadlinks) {
            return; // Skip processing, prevent it from being added to the graph
        }

        // Check for the presence of the "noarticletext" element
        // Wikipedia autopopulated dead links with this template: https://en.wikipedia.org/wiki/Template:No_article_text
        // Given this template will only appear in "Wikipedia:" pages (already blacklisted, so will be removed elsewhere) and dead links, this makes a great indicator that *should* hold across all ~7 million pages
        if (doc.querySelector("#noarticletext")) {
            const deadLink = safeString(articleNames[index]);
            console.warn(`Warning: dead link detected: ${deadLink}`);
            if (!deadlinks.includes(deadLink)) {
                deadlinks.push(deadLink); // Add to the dead links array
            }
            return; // Skip processing this article, preventing it from being added to the graph
        }

        // If a redirect occurred, update redirectsFromFile
        if (articleName !== resolvedName) {
            if (!redirectsFromFile[resolvedName]) {
                redirectsFromFile[resolvedName] = [];
            }
            // Only add the alias if it isn't already in the list
            if (!redirectsFromFile[resolvedName].includes(articleName)) {
                redirectsFromFile[resolvedName].push(articleName);
            }
        }

        // Store the correct title
        titleDict[resolvedName] = pageTitle;

        // Process links and resolve redirects as we go.
        let partialLinks = [...doc.querySelectorAll("#mw-content-text a")]
            .map(link => link.getAttribute("href"))
            .filter(link => link && link.startsWith("/wiki/"))
            .map(link => {
                let name = getPartialURL(resolveHash(link.replace("/wiki/", "")));
                return resolveRedirect(safeString(name));
            })
            .filter(link => !isBlacklistedURL(link));

        // Use the canonical (resolved) name for newData.
        newData[resolvedName] = {
            Title: pageTitle,
            Links: partialLinks.map(safeString),
            Updates: (data[resolvedName]?.Updates || 0) + 1,
            Category: 0
        };

        // Ensure that every linked article exists in data (store using canonical names)
        partialLinks.forEach(link => {
            link = resolveRedirect(link);
            if (!data[link]) {
                data[link] = {
                    Title: safeString(link),
                    Links: [],
                    Updates: 0,
                    Category: 0
                };
            }
        });
    });

    // Apply the correct titles from titleDict to the existing data.
    for (const key of Object.keys(data)) {
        if (titleDict[key]) {
            data[key].Title = titleDict[key];
        }
    }

    mergeData(newData);

    // Remove dead links
    deadlinks.forEach(deadLink => {
        // Remove links to the dead link from other articles.
        for (const key in data) {
            if (data.hasOwnProperty(key)) { // avoid prototype pollution
                const index = data[key].Links.indexOf(deadLink);
                if (index > -1) {
                    data[key].Links.splice(index, 1); // Remove the dead link
                }
            }
        }
        // Remove the dead link article itself from the data object.
        delete data[deadLink];
    });

    // For every canonical target, if an alias node exists in data, merge its contents.
    for (const [target, aliases] of Object.entries(redirectsFromFile)) {
        aliases.forEach(alias => {
            // Strict (case-sensitive) check: merge only if the alias exactly matches.
            if (data[alias] && alias !== target) {
                if (!data[target]) {
                    data[target] = { ...data[alias] };
                } else {
                    data[target].Links = [...new Set([...data[target].Links, ...data[alias].Links])];
                    data[target].Updates = Math.max(data[target].Updates, data[alias].Updates);
                }
                delete data[alias];
            }
        });
    }
    
    // This pass loops over all keys and ensures that if a key is an alias according to redirectsFromFile,
    // it gets merged into its canonical target.
    function canonicalizeGraphData() {
        const canonicalData = {};
        for (const key in data) {
            // Determine the canonical key using resolveRedirect (which does strict matching)
            const canonical = resolveRedirect(key);
            if (!canonicalData[canonical]) {
                canonicalData[canonical] = { ...data[key] };
            } else {
                canonicalData[canonical].Links = [...new Set([...canonicalData[canonical].Links, ...data[key].Links])];
                canonicalData[canonical].Updates = Math.max(canonicalData[canonical].Updates, data[key].Updates);
            }
        }
        data = canonicalData;
    }
    canonicalizeGraphData();

    // Selects the title of the parsed article to be the new page title. Not done previously to make this work in parallel
    let updatedTitles = Object.keys(newData).map(key => titleDict[key] || key);

    console.log(`Updated ${updatedTitles.length} articles: ${colBlue}${updatedTitles.join(`${colReset}, ${colBlue}`)}${colReset}`);
    if (updatedTitles.length !== arg) { // Less than n articles searched, print note to prevent confusion of asking for 10 but only reading 1
        console.log(`${colGrey}Note: ${arg - updatedTitles.length} were not done due to redirects, deadlinks, or a short input JSON${colReset}`);
    }
    const itemsToUpdate = Object.values(data).filter(item => item.Updates === 0).length;
    const objectTotal = Object.keys(data).length;
    console.log(`${itemsToUpdate} entries to update, ${objectTotal - itemsToUpdate} done so far`);

    // Re-sort data for consistency. While un-neccesary, makes the JSON more human-readable with the downside of predictable order of article parsing
    data = Object.keys(data).sort().reduce((obj, key) => { 
        obj[key] = data[key]; 
        return obj;
    }, {});

    // Write updated versions to all three files
    fs.writeFileSync(filePath1, JSON.stringify(data, null, 2), 'utf-8');
    fs.writeFileSync(filePath2, JSON.stringify(redirectsFromFile, null, 2), 'utf-8');
    fs.writeFileSync(filePath3, JSON.stringify(deadlinks, null, 2), 'utf-8');
}


updateGraph();
