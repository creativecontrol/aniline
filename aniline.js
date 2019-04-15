/**
* @fileoverview Aniline implements Magenta improvisation algorithms using Electron.
* The currently available Electron apps from the Magenta team are not real-time.
* This is an effort to make the systems available for real-time preformance use.
*/

const {app, BrowserWindow} = require('electron');

function createWindow () {
    let win =  new BrowserWindow({width:300, height:500});

    win.loadFile('index.html');

    // win.webContents.openDevTools();

    // Emitted when the window is closed.
    win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
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
  if (win === null) {
    createWindow();
  }
});
