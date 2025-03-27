import express from "express";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
import * as cheerio from "cheerio";

dotenv.config();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const router = express.Router();

router.post("/scrapper", async (req, res) => {
    let browser;
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).send("URL is required in the request body");
        }

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
            timeout: 120000, // Increased timeout to 2 minutes
            executablePath: process.env.CHROME_BIN || null
        });
        console.log("Browser launched successfully");
        const page = await browser.newPage();
        
        // Set a longer timeout for navigation
        page.setDefaultNavigationTimeout(120000); // Increased timeout to 2 minutes
        
        // Set user agent to avoid detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        // Add additional headers
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

        // Enable JavaScript and cookies
        await page.setJavaScriptEnabled(true);
        
        console.log("Navigating to screener.in login page...");
        await page.goto("https://www.screener.in/login/?", { 
            waitUntil: 'networkidle0',
            timeout: 120000 
        });
        
        // // Add random delay to simulate human behavior
        // await delay(Math.random() * 2000 + 1000);
        
        // Wait for login form elements to be present
        console.log("Waiting for login form...");
        await page.waitForSelector('#id_username', { timeout: 30000 });
        await page.waitForSelector('#id_password', { timeout: 30000 });
        await page.waitForSelector('button.button-primary', { timeout: 30000 });
        
        // Fill in login credentials with random delays
        console.log("Filling in login credentials...");
        await page.type('#id_username', process.env.USERNAME);
        await page.type('#id_password', process.env.PASSWORD);
        
        // Click the login button
        console.log("Clicking login button...");
        await page.click('button.button-primary');
        
        // Wait for navigation after login with a more flexible approach
        console.log("Waiting for login to complete...");
        try {
            await page.waitForNavigation({ 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 120000 
            });
        } catch (error) {
            console.log("Navigation timeout, checking if we're already logged in...");
            // Check if we're already on the dashboard or if login was successful
            const currentUrl = page.url();
            if (!currentUrl.includes('/login/')) {
                console.log("Already logged in, proceeding...");
            } else {
                throw error;
            }
        }

        // // Add a small delay after login
        // await delay(2000);

        // Navigate to the provided URL
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

        // Parse the ratios using cheerio
        $('.company-ratios #top-ratios li').each((_, element) => {
            const name = $(element).find('.name').text().trim();
            const valueElement = $(element).find('.value');
            
            if (valueElement.length) {
                // Get all number spans
                const numbers = valueElement.find('.number').map((_, el) => $(el).text().trim()).get();
                
                // Get the text content excluding the number spans
                let textContent = valueElement.text().trim();
                numbers.forEach(num => {
                    textContent = textContent.replace(num, '');
                });
                
                // Clean up the text content
                textContent = textContent
                    .replace(/\n/g, '') // Remove newlines
                    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                    .replace(/₹/g, '') // Remove rupee symbol
                    .replace(/\/\s*\/\s*/, '/') // Clean up double slashes
                    .trim();
                
                // Combine numbers and text
                let value = numbers.join(' / ');
                if (textContent) {
                    value += ' ' + textContent;
                }
                
                // Clean up the final value
                value = value
                    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                    .trim();
                
                if (name && value) {
                    ratios[name] = value;
                }
            }
        });

        console.log("Ratios scraped successfully");
        await browser.close();
        res.json(ratios);
    } catch (error) {
        console.error("Error in scrapper route:", error);
        if (browser) {
            await browser.close();
        }
        res.status(500).send(`Scrapper error: ${error.message}`);
    }
});

export default router;