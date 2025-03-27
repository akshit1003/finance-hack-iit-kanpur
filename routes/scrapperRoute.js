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
                '--disable-features=IsolateOrigins,site-per-process'
            ],
            defaultViewport: null,
            timeout: 60000
        });
        console.log("Browser launched successfully");
        const page = await browser.newPage();
        
        // Set a longer timeout for navigation
        page.setDefaultNavigationTimeout(60000);
        
        console.log("Navigating to screener.in login page...");
        await page.goto("https://www.screener.in/login/?", { 
            waitUntil: 'networkidle0',
            timeout: 60000 
        });
        
        // Wait for login form elements to be present
        console.log("Waiting for login form...");
        await page.waitForSelector('#id_username', { timeout: 30000 });
        await page.waitForSelector('#id_password', { timeout: 30000 });
        await page.waitForSelector('button.button-primary', { timeout: 30000 });
        
        // Fill in login credentials
        console.log("Filling in login credentials...");
        await page.type('#id_username', process.env.USERNAME);
        await page.type('#id_password', process.env.PASSWORD);
        
        // Click the login button
        console.log("Clicking login button...");
        await page.click('button.button-primary');
        
        // Wait for navigation after login
        console.log("Waiting for login to complete...");
        await page.waitForNavigation({ 
            waitUntil: 'networkidle0',
            timeout: 60000 
        });

        // Navigate to the provided URL
        console.log(`Navigating to screener.in${url}...`);
        await page.goto(`https://www.screener.in${url}`, {
            waitUntil: 'networkidle0',
            timeout: 60000
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