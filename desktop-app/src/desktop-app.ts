import 'babel-polyfill';

import { app, BrowserWindow, shell, Menu, screen, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as url from 'url';
import * as path from 'path';
import { initialize } from './lib/ledger';
const log = require('electron-log');
// Don't want errors to display when checking for update
// Too annoying if there would be long-term problems with the source
// Error would pop up on every launch
let showUpdateErrors = false;

/** 
 * By default, the logger writes logs to the following locations:
  on Linux: ~/.config/BananoNanoNault/logs/{process type}.log
  on macOS: ~/Library/Logs/BananoNanoNault/{process type}.log
  on Windows: %USERPROFILE%\AppData\Roaming\BananoNanoNault\logs\{process type}.log

  error, warn, info, verbose, debug, silly
 * */

 // determine log location
let logLocation = 'Unknown';
switch (process.platform) {
  case 'win32':
    logLocation = '%USERPROFILE%\\AppData\\Roaming\\BananoNanoNault\\logs\\main.log';
    break;
  case 'linux':
    logLocation = '~/.config/BananoNanoNault/logs/main.log';
    break;
  case 'darwin':
    logLocation = '~/Library/Logs/BananoNanoNault/main.log';
    break;
}

class AppUpdater {
  constructor() {
    // We want the user to proactively download the install
    autoUpdater.autoDownload = false;
    autoUpdater.logger = log;

    autoUpdater.on('update-available', (event, releaseNotes, releaseName) => {
      const dialogOpts = {
        type: 'info',
        buttons: ['Update', 'Ask Later'],
        title: 'New Version',
        message: 'An update for BananoNanoNault is available!',
        detail: 'Do you want to download and install it?'
      }
    
      dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) {
          showUpdateErrors = true; // enable errors
          autoUpdater.downloadUpdate();
        } 
      })
    })

    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
      autoUpdater.quitAndInstall(true, true);
    })

    autoUpdater.on('download-progress', (progressObj) => {
      sendStatusToWindow(progressObj);
    })

    autoUpdater.on('error', message => {
      log.error('There was a problem updating the application');
      log.error(message);

      if (!showUpdateErrors) {
        return;
      }
      mainWindow.setTitle(`BananoNanoNault - ${autoUpdater.currentVersion}`); // reset title
      showUpdateErrors = false; // disable errors
      const dialogOpts = {
        type: 'error',
        buttons: ['OK'],
        title: 'Update Error',
        message: 'Something went wrong while downloading BananoNanoNault.',
        detail: `You will be notified again on next start.\nMore details in the log at: ${logLocation}`
      }
    
      dialog.showMessageBox(dialogOpts).then((returnValue) => {})
    })
  }
}
new AppUpdater();

app.setAsDefaultProtocolClient('nano'); // Register handler for nano: links

// Initialize Ledger device detection
initialize();

let mainWindow;

function createWindow () {
  let newWidth = 1000;
  let newHeight = 600;
  try {
    const mainScreen = screen.getPrimaryDisplay();
    const dimensions = mainScreen.size;
    newWidth = Math.max(newWidth, Math.round(dimensions.width * 0.8));
    newHeight = Math.max(newHeight, Math.round(dimensions.height * 0.85));
  } catch {}

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: newWidth,
    height: newHeight,
    webPreferences:
    {
      webSecurity: false,
      devTools: true,
      nodeIntegration: true
    }
  });

  // mainWindow.loadURL('http://localhost:4200/'); // Only use this for development
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, '../../dist/index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // Detect link clicks to new windows and open them in the default browser
  mainWindow.webContents.on('new-window', function(e, externalurl) {
    e.preventDefault();
    shell.openExternal(externalurl);
  });

  mainWindow.webContents.on('did-finish-load', function () {
    mainWindow.setTitle(`BananoNanoNault - ${autoUpdater.currentVersion}`);
  });

  const menuTemplate = getApplicationMenu();

  // Create our menu entries so that we can use MAC shortcuts
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

function sendStatusToWindow(progressObj) {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + Math.round(progressObj.percent) + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';

  log.info(log_message);
  // sending message to ipcRenderer can be done as well but not sure where and how to display it
  // using the title bar instead
  // mainWindow.webContents.send('downloading', Math.round(progressObj.percent));
  mainWindow.setTitle(`BananoNanoNault - ${autoUpdater.currentVersion} - Downloading Update: ${Math.round(progressObj.percent)} %`);
}

app.on('ready', () => {
  // Once the app is ready, launch the wallet window
  createWindow();

  // Detect when the application has been loaded using an nano: link, send it to the wallet to load
  app.on('open-url', (event, eventpath) => {
    if (!mainWindow) {
      createWindow();
    }
    if (!mainWindow.webContents.isLoading()) {
      mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('protocol-load', { detail: '${eventpath}' }));`);
    }
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('protocol-load', { detail: '${eventpath}' }));`);
    });
    event.preventDefault();
  });

  // Check for any updates on GitHub
  checkForUpdates();
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

function checkForUpdates() {
  autoUpdater.checkForUpdates();
}

// Build up the menu bar options based on platform
function getApplicationMenu() {
  const template: any = [
    {
      label: 'Edit',
      submenu: [
        {role: 'undo'},
        {role: 'redo'},
        {type: 'separator'},
        {role: 'cut'},
        {role: 'copy'},
        {role: 'paste'},
        {role: 'pasteandmatchstyle'},
        {role: 'delete'},
        {role: 'selectall'}
      ]
    },
    {
      label: 'View',
      submenu: [
        {role: 'reload'},
        {role: 'forcereload'},
        {role: 'toggledevtools'},
        {type: 'separator'},
        {role: 'resetzoom'},
        {role: 'zoomin'},
        {role: 'zoomout'},
        {type: 'separator'},
        {role: 'togglefullscreen'}
      ]
    },
    {
      role: 'window',
      submenu: [
        {role: 'minimize'},
        {role: 'close'}
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Nault Help Docs',
          click () { loadExternal('https://docs.nault.cc/'); }
        },
        {
          label: 'Reddit (r/nanocurrency)',
          click () { loadExternal('https://www.reddit.com/r/nanocurrency'); }
        },
        {
          label: 'Discord (#nault)',
          click () { loadExternal('https://discord.nanocenter.org/'); }
        },
        {type: 'separator'},
        {
          label: 'View GitHub',
          click () { loadExternal('https://github.com/Joohansson/BananoNanoNault'); }
        },
        {
          label: 'Submit a bug report',
          click () { loadExternal('https://github.com/Joohansson/BananoNanoNault/issues/new'); }
        },
        {
          label: 'Release notes',
          click () { loadExternal('https://github.com/Joohansson/BananoNanoNault/releases'); }
        },
        {type: 'separator'},
        {
          label: `Check for Updates`,
          click (menuItem, browserWindow) {
            checkForUpdates();
          }
        },
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: 'BananoNanoNault',
      submenu: [
        {role: 'about'},
        {type: 'separator'},
        {
          label: `Check for Updates`,
          click (menuItem, browserWindow) {
            checkForUpdates();
          }
        },
        {type: 'separator'},
        // {role: 'services', submenu: []},
        // {type: 'separator'},
        {role: 'hide'},
        {role: 'hideothers'},
        {role: 'unhide'},
        {type: 'separator'},
        {role: 'quit'}
      ]
    });

    // Edit menu
    template[1].submenu.push(
      {type: 'separator'},
      {
        label: 'Speech',
        submenu: [
          {role: 'startspeaking'},
          {role: 'stopspeaking'}
        ]
      }
    );

    // Window menu
    template[3].submenu = [
      {role: 'close'},
      {role: 'minimize'},
      {role: 'zoom'},
      {type: 'separator'},
      {role: 'front'}
    ];
  }

  return template;
}

function loadExternal(externalurl: string) {
  shell.openExternal(externalurl);
}
