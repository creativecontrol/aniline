/**
* @fileoverview Aniline implements Magenta improvisation algorithms using Electron.
* The currently available Electron apps from the Magenta team are not real-time.
* This is an effort to make the Magenta processes available for real-time preformance use.
*/

const {app, BrowserWindow, ipcMain} = require('electron');
const webpage = 'index.html';

const DataStore = require('./DataStore');
const prefsData = new DataStore();

function createWindow () {
  let window = new BrowserWindow({
    width: 300,
    height: 500,
    titleBarStyle: 'hidden',
    fullscreenable: false,
    maximizable: false,
    resizable: true,
    moveable: true
  });

  window.loadFile(webpage);

  ipcMain.on('store-prefs', (event, prefs) => {
    prefsData.savePrefs(prefs);
  });

  ipcMain.on('load-prefs', () => {
    let prefs = prefsData.getPrefs().prefs;
    console.debug(prefs);
    window.send('prefs', prefs);
  });

  window.on('closed', () => {
    window = null;
  });
}

app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (window === null) {
    createWindow();
  }
});
