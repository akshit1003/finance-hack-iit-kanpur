import express from "express";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
import * as cheerio from "cheerio";

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

        browser = await puppeteer.launch({
            headless: false,
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
                        const href = item.classList.contains('active') ? 
                            `/company/${item.textContent.trim().toLowerCase().replace(/\s+/g, '-')}/` : null;
                        
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
            return res.status(400).send("name is required in the request body");
        }

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
        
        await page.goto("https://www.screener.in/login/?", { 
            waitUntil: 'networkidle0',
            timeout: 120000 
        });
        
        await page.waitForSelector('#id_username', { timeout: 30000 });
        await page.waitForSelector('#id_password', { timeout: 30000 });
        await page.waitForSelector('button.button-primary', { timeout: 30000 });
        
        await page.type('#id_username', process.env.USERNAME);
        await page.type('#id_password', process.env.PASSWORD);
        await page.click('button.button-primary');
        
        try {
            await page.waitForNavigation({ 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 120000 
            });
        } catch (error) {
            const currentUrl = page.url();
            if (!currentUrl.includes('/login/')) {
                console.log("Already logged in, proceeding...");
            } else {
                throw error;
            }
        }

        await page.waitForSelector('#desktop-search > div > input', { timeout: 30000 });
        await page.focus('#desktop-search > div > input');
        await page.$eval('#desktop-search > div > input', el => el.value = '');
        await page.type('#desktop-search > div > input', name);
        
        await page.waitForSelector('.dropdown-content li.active', { 
            visible: true, 
            timeout: 10000 
        });
        
        await delay(1000);
        await page.click('.dropdown-content li.active');
        
        try {
            await Promise.race([
                page.waitForSelector('.company-ratios', { timeout: 30000 }),
                page.waitForSelector('.company-name', { timeout: 30000 })
            ]);
            
            await delay(2000);
            
            const currentUrl = page.url();
            if (!currentUrl.includes('/company/')) {
                await page.click('.dropdown-content li.active');
                await delay(2000);
            }
        } catch (error) {
            await page.screenshot({ path: 'error-state.png' });
            throw error;
        }

        const html = await page.content();
        const $ = cheerio.load(html);
        const ratios = {};

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
                }
            }
        });

        await browser.close();
        res.json({ ratios });
    } catch (error) {
        console.error("Error in scrapper route:", error);
        if (browser) {
            await browser.close();
        }
        res.status(500).send(`Scrapper error: ${error.message}`);
    }
});

export default router;