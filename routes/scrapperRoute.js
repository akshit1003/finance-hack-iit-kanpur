import express from "express";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
import * as cheerio from "cheerio";
import axios from "axios";

dotenv.config();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const router = express.Router();

router.get("/search/:p", async (req, res) => {
    let browser;
    try {
        const searchParam = req.params.p;
        
        if (!searchParam) {
            return res.status(400).send("Search parameter is required");
        }

        console.log(`Starting search for: ${searchParam}`);
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080',
            ],
            defaultViewport: null,
            timeout: 60000,
            executablePath: process.env.CHROME_BIN || null
        });
        
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        await page.goto("https://www.screener.in", { 
            waitUntil: 'networkidle0',
            timeout: 60000 
        });
        
        await page.waitForSelector('.home-search > div:nth-child(1) > input:nth-child(2)', { timeout: 10000 });
        
        await page.focus('.home-search > div:nth-child(1) > input:nth-child(2)');
        await page.type('.home-search > div:nth-child(1) > input:nth-child(2)', searchParam);
        
        await page.waitForSelector('.home-search > div:nth-child(1) > ul:nth-child(3)', { 
            visible: true, 
            timeout: 10000 
        });
        
        await delay(2000);
        
        await page.waitForNetworkIdle({ timeout: 5000 });
        
        await delay(1000);
        
        const dropdownResults = await page.evaluate(() => {
            const results = [];
            const dropdown = document.querySelector('.home-search > div:nth-child(1) > ul:nth-child(3)');
            if (dropdown) {
                const items = dropdown.querySelectorAll('li');
                items.forEach(item => {
                    if (item.textContent.includes('Search everywhere')) {
                        results.push({
                            name: item.textContent.trim(),
                            isSearchEverywhere: true,
                            url: null
                        });
                    } else {
                        let href = null;
                        const link = item.querySelector('a');
                        if (link) {
                            href = link.getAttribute('href');
                        }
                        if (!href) {
                            const name = item.textContent.trim();
                            href = `/company/${name.toLowerCase().replace(/\s+/g, '-')}/`;
                        }
                        
                        results.push({
                            name: item.textContent.trim(),
                            isSearchEverywhere: false,
                            url: href
                        });
                    }
                });
            }
            return results;
        });
        
        console.log(`Found ${dropdownResults.length} search results`);
        console.log('Results:', JSON.stringify(dropdownResults, null, 2));
        await browser.close();
        res.json({ results: dropdownResults });
    } catch (error) {
        console.error("Error in search route:", error);
        if (browser) {
            await browser.close();
        }
        res.status(500).send(`Search error: ${error.message}`);
    }
});

router.post("/scrapper", async (req, res) => {
    let browser;
    try {
        const { name } = req.body;
        
        if (!name) {
            return res.status(400).send("Company name is required in the request body");
        }

        // First get the correct URL from the API
        const searchResponse = await axios.get('https://www.screener.in/api/company/search/', {
            params: {
                q: name,
                v: 3,
                fts: 1
            }
        });

        // Find the matching company in the search results
        const matchingCompany = searchResponse.data.find(company => company.name === name);
        
        if (!matchingCompany) {
            return res.status(404).send(`Company "${name}" not found`);
        }

        const url = matchingCompany.url;
        console.log(`Found matching company URL: ${url}`);

        console.log("Starting puppeteer in Docker...");
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--start-maximized',
                '--remote-debugging-port=9222',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-extensions',
                '--disable-software-rasterizer',
                '--disable-notifications',
                '--disable-popup-blocking',
                '--disable-infobars',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-site-isolation-trials'
            ],
            defaultViewport: null,
            timeout: 120000, 
            executablePath: process.env.CHROME_BIN || null
        });
        console.log("Browser launched successfully");
        
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(120000); 
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        });

        await page.setJavaScriptEnabled(true);
        
        console.log("Navigating to screener.in login page...");
        await page.goto("https://www.screener.in/login/?", { 
            waitUntil: 'networkidle0',
            timeout: 120000 
        });
        
        console.log("Waiting for login form...");
        await page.waitForSelector('#id_username', { timeout: 30000 });
        await page.waitForSelector('#id_password', { timeout: 30000 });
        await page.waitForSelector('button.button-primary', { timeout: 30000 });
        
        console.log("Filling in login credentials...");
        await page.type('#id_username', process.env.USERNAME);
        await page.type('#id_password', process.env.PASSWORD);
        
        console.log("Clicking login button...");
        await page.click('button.button-primary');
        
        console.log("Waiting for login to complete...");
        try {
            await page.waitForNavigation({ 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 120000 
            });
        } catch (error) {
            console.log("Navigation timeout, checking if we're already logged in...");
            const currentUrl = page.url();
            if (!currentUrl.includes('/login/')) {
                console.log("Already logged in, proceeding...");
            } else {
                throw error;
            }
        }

        // console.log("Waiting for search box...");
        // await page.waitForSelector('#desktop-search > div > input', { timeout: 30000 });
        
        // console.log(`Typing company name: ${name}`);
        // await page.focus('#desktop-search > div > input');
        // await page.$eval('#desktop-search > div > input', el => el.value = '');
        // await page.type('#desktop-search > div > input', name);
        
        // console.log("Waiting for search dropdown...");
        // await page.waitForSelector('.dropdown-content li.active', { 
        //     visible: true, 
        //     timeout: 10000 
        // });
        
        // await delay(1000);
        
        // console.log("Clicking the first active result...");
        // await page.click('.dropdown-content li.active');
        
        console.log(`Navigating to screener.in${url}...`);
        await page.goto(`https://www.screener.in${url}`, {
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 120000
        });

        // Wait for the company ratios section to load
        console.log("Waiting for company ratios to load...");
        await page.waitForSelector('.company-ratios', { timeout: 30000 });

        // Get the HTML content
        const html = await page.content();
        
        // Load HTML into cheerio
        const $ = cheerio.load(html);
        const ratios = {};

        const ratioElements = $('.company-ratios #top-ratios li');
        console.log(`Found ${ratioElements.length} ratio elements`);

        $('.company-ratios #top-ratios li').each((_, element) => {
            const name = $(element).find('.name').text().trim();
            const valueElement = $(element).find('.value');
            
            if (valueElement.length) {
                const numbers = valueElement.find('.number').map((_, el) => $(el).text().trim()).get();
                
                let textContent = valueElement.text().trim();
                numbers.forEach(num => {
                    textContent = textContent.replace(num, '');
                });
                
                textContent = textContent
                    .replace(/\n/g, '')
                    .replace(/\s+/g, ' ')
                    .replace(/₹/g, '')
                    .replace(/\/\s*\/\s*/, '/')
                    .trim();
                
                let value = numbers.join(' / ');
                if (textContent) {
                    value += ' ' + textContent;
                }
                
                value = value
                    .replace(/\s+/g, ' ')
                    .trim();
                
                if (name && value) {
                    ratios[name] = value;
                    console.log(`Scraped ratio: ${name} = ${value}`);
                }
            }
        });

        console.log("Ratios scraped successfully");
        console.log("Total ratios found:", Object.keys(ratios).length);

        console.log("Waiting for quarters section to load...");
        await page.waitForSelector('#quarters', { timeout: 30000 });
        
        // Get updated HTML content for quarters
        const quarterHtml = await page.content();
        const $quarters = cheerio.load(quarterHtml);
        
        // Initialize quarters data structure
        const quarters = {
            periods: [],
            data: {}
        };

        // Get all quarter periods (column headers)
        $quarters('#quarters .data-table thead th').each((index, element) => {
            if (index > 0) { // Skip the first header which is empty
                quarters.periods.push($quarters(element).text().trim());
            }
        });

        // Process each row of quarterly data
        $quarters('#quarters .data-table tbody tr').each((rowIndex, row) => {
            // Skip the last row which contains PDF links
            if (!$quarters(row).find('td').first().text().includes('Raw PDF')) {
                const metricName = $quarters(row).find('td').first().text().trim();
                
                // Clean up metric name by removing the + symbol if present
                const cleanMetricName = metricName.replace(/\+$/, '').trim();
                
                // Initialize array for this metric
                quarters.data[cleanMetricName] = [];
                
                // Get all values for this metric
                $quarters(row).find('td').each((cellIndex, cell) => {
                    if (cellIndex > 0) { // Skip the first cell which is the metric name
                        quarters.data[cleanMetricName].push($quarters(cell).text().trim());
                    }
                });
            }
        });

        console.log("Quarterly data scraped successfully");

        // Wait for the peers section to load
        console.log("Waiting for peers section to load...");
        await page.waitForSelector('#peers', { timeout: 30000 });
        
        // Get updated HTML content for peers
        const peersHtml = await page.content();
        const $peers = cheerio.load(peersHtml);
        
        // Initialize peers data structure
        const peers = {
            headers: [],
            companies: []
        };

        // Get the table headers (metrics)
        $peers('#peers .data-table th').each((index, element) => {
            // Skip the first two headers which are S.No. and Name
            if (index > 1) {
                const headerText = $peers(element).text().trim();
                // Extract the main header without the unit
                const mainHeader = headerText.split('\n')[0].trim();
                // Extract the unit if present
                const unitMatch = headerText.match(/\s*([^\.]+)\.?\s*$/);
                const unit = unitMatch && unitMatch[1] ? unitMatch[1].trim() : '';
                
                peers.headers.push({
                    name: mainHeader,
                    unit: unit,
                    tooltip: $peers(element).attr('data-tooltip') || mainHeader
                });
            }
        });

        // Get data for each peer company
        $peers('#peers .data-table tbody tr[data-row-company-id]').each((rowIndex, row) => {
            const companyId = $peers(row).attr('data-row-company-id');
            const companyName = $peers(row).find('td.text a').text().trim();
            const companyUrl = $peers(row).find('td.text a').attr('href');
            
            const companyData = {
                id: companyId,
                name: companyName,
                url: companyUrl,
                metrics: {}
            };
            
            // Get all values for this company (skip first two cells which are S.No. and Name)
            let metricIndex = 0;
            $peers(row).find('td').each((cellIndex, cell) => {
                if (cellIndex > 1) { // Skip S.No and Name columns
                    if (metricIndex < peers.headers.length) {
                        const metricName = peers.headers[metricIndex].name;
                        companyData.metrics[metricName] = $peers(cell).text().trim();
                        metricIndex++;
                    }
                }
            });
            
            peers.companies.push(companyData);
        });

        // Get median values if present
        const medianRow = $peers('#peers .data-table tfoot tr');
        if (medianRow.length) {
            const medianData = {
                name: "Median",
                metrics: {}
            };
            
            // Get all median values (skip first two cells)
            let metricIndex = 0;
            medianRow.find('td').each((cellIndex, cell) => {
                if (cellIndex > 1) { // Skip empty cell and "Median" text
                    if (metricIndex < peers.headers.length) {
                        const metricName = peers.headers[metricIndex].name;
                        medianData.metrics[metricName] = $peers(cell).text().trim();
                        metricIndex++;
                    }
                }
            });
            
            // Add sector/industry info
            const sectorText = $peers('#peers .sub a').first().text().trim();
            const industryText = $peers('#peers .sub a').last().text().trim();
            
            medianData.sector = sectorText;
            medianData.industry = industryText;
            
            peers.median = medianData;
        }

        console.log("Peer comparison data scraped successfully");

        // Wait for the profit-loss section to load
        console.log("Waiting for profit-loss section to load...");
        await page.waitForSelector('#profit-loss', { timeout: 30000 });
        
        // Get updated HTML content for profit & loss
        const plHtml = await page.content();
        const $pl = cheerio.load(plHtml);
        
        // Initialize profit & loss data structure
        const profitLoss = {
            periods: [],
            data: {},
            growth: {
                sales: {},
                profit: {},
                stockPrice: {},
                roe: {}
            }
        };

        // Get all year periods (column headers)
        $pl('#profit-loss .data-table thead th').each((index, element) => {
            if (index > 0) { // Skip the first header which is empty
                profitLoss.periods.push($pl(element).text().trim());
            }
        });

        // Process each row of P&L data
        $pl('#profit-loss .data-table tbody tr').each((rowIndex, row) => {
            const metricName = $pl(row).find('td').first().text().trim();
            
            // Clean up metric name by removing the + symbol if present
            const cleanMetricName = metricName.replace(/\+$/, '').trim();
            
            // Initialize array for this metric
            profitLoss.data[cleanMetricName] = [];
            
            // Get all values for this metric
            $pl(row).find('td').each((cellIndex, cell) => {
                if (cellIndex > 0) { // Skip the first cell which is the metric name
                    profitLoss.data[cleanMetricName].push($pl(cell).text().trim());
                }
            });
        });

        // Extract growth tables data (Compounded Sales Growth, Profit Growth, etc.)
        const extractGrowthData = (tableIndex, targetObj) => {
            $pl('#profit-loss .ranges-table').eq(tableIndex).find('tr').each((rowIndex, row) => {
                if (rowIndex > 0) { // Skip header row
                    const period = $pl(row).find('td').first().text().trim().replace(':', '');
                    const value = $pl(row).find('td').last().text().trim();
                    targetObj[period] = value;
                }
            });
        };

        // Extract data from each growth table
        extractGrowthData(0, profitLoss.growth.sales);
        extractGrowthData(1, profitLoss.growth.profit);
        extractGrowthData(2, profitLoss.growth.stockPrice);
        extractGrowthData(3, profitLoss.growth.roe);

        console.log("Profit & Loss data scraped successfully");
        await browser.close();
        
        // Return all scraped data
        res.json({ ratios, quarters, peers, profitLoss });
    } catch (error) {
        console.error("Error in scrapper route:", error);
        if (browser) {
            await browser.close();
        }
        res.status(500).send(`Scrapper error: ${error.message}`);
    }
});

router.get('/search/:p', async (req, res) => {
    try {
        const p = req.params.p;

      // Make request to Screener.in API
      const response = await axios.get('https://www.screener.in/api/company/search/', {
        params: {
          q: p,
          v: 3,
          fts: 1
        }
      });
      
      // Log the response data to console
      console.log('Screener API Response:', response.data);
      
      // Send the data back to the client
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching data from Screener API:', error.message);
      res.status(500).json({ error: 'Failed to fetch data from Screener API' });
    }
  });
  

export default router;