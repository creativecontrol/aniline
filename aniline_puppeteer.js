/**
* @fileoverview Aniline implements Magenta improvisation algorithms thorugh the JS Web context.
* The intent is to run this on an UP Board.
* This is done by running Puppeteer to control a headless browser to reduce the
* overhead of running a GUI. This may prove an issue as the GPU may be needed
* for Magenta operation.
* Python and directly running Magenta in NodeJS but these were not deemed feasible.
* Python requires the entire installation of Magenta which is not currently compatible
* with Raspberry Pi.
* NodeJS (using TypeScript) has issues finding the WebMidi context required for
* Magenta to be used.
*/

const puppeteer = require('puppeteer');
const fs = require('fs');
const util = require('util');
const path = require('path');
const express = require('express');
const process = require('process');

/**
* Start a static web server for serving the project site to puppeteer.
* This will serve the HTML and static JS files.
* @param {int} _port
*/
function startWebServer(_port) {

    const app = express();

    var port = _port;

    // viewed at http://localhost:8080
    app.get('/', function(req, res) {
        res.sendFile(path.join(__dirname + '/index.html'));
    });
    app.use(express.static('./'))
    app.listen(port);
    console.log(`http://localhost:${port}`);
}

/**
* Open a headless Chromium browser using puppeteer
* @param {int} _port
*/
function startBrowser(_port) {
    var port = _port;

    startWebServer(port);

    (async () => {
      const browser = await puppeteer.launch({
        ignoreDefaultArgs: ['--mute-audio', '--disable-gpu'],
        enableAudio: true,
	headless: false,
      });
      // recommended way to allow MIDI permissions for a page as per
      // https://github.com/GoogleChrome/puppeteer/issues/2973
      await browser.defaultBrowserContext().overridePermissions(`http://localhost:${port}`, ['midi']);
      const page = await browser.newPage();
      // page.on('console', (log) => console[log._type](log._text));
      page.on('console', msg => {
          for (let i = 0; i < msg.args().length; ++i)
            console.log(`${i}: ${msg.args()[i]}`);
        });
      await page.goto(`http://localhost:${port}`);
      await page.click('#play',{
            button: 'left', //left, right, middle,
            clickCount: 1,
            delay: 200 //how long to hold down the mouse button
      });

      console.log("opened");

      process.on('SIGINT', async function() {
  	await browser.close();
  	process.exit();
      });

      
    })();
}

startBrowser(3000);
