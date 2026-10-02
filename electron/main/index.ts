import { app, session, BrowserWindow, nativeImage, ipcMain, dialog, protocol, Menu, MenuItemConstructorOptions, Tray} from 'electron'
import { release } from 'node:os'
import { join, basename } from 'node:path'
import { update } from './update'
import { getTemplate, show_open_dialog } from '../menu/menu'
import { asrStart, asrStop, asrTranscribe } from '../asr/host'
import { i18n } from '../i18n/i18n'
import * as fs from 'node:fs'
// import { createFFmpeg } from '@ffmpeg/ffmpeg'
import {GetMimeCodecs} from 'ffmime'

process.env.DIST_ELECTRON = join(__dirname, '../')
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST
process.env.JS_FLAGS = "--unhandled-rejections=strict --experimental-wasm-threads --experimental-wasm-bulk-memory"

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}


// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

export let win: BrowserWindow | null = null
// Here, you can also use other preload
const preload = join(__dirname, '../preload/index.js')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = join(process.env.DIST, 'index.html')

let playstatus = 0

async function createWindow() {

  win = new BrowserWindow({
    title: 'JJPlayer',
    icon: join(process.env.PUBLIC, 'favicon.ico'),
    backgroundColor: 'black',
    titleBarOverlay: true,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      contextIsolation: false,
      webSecurity: true,
      // https://www.electronjs.org/zh/docs/latest/tutorial/offscreen-rendering
      // offscreen: true,
    },
  })

  if (url) { // electron-vite-vue#298
    await win.loadURL(url)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    return { action: 'deny' }
  })

  // Apply electron-updater
  update(win)
  return win
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'play', 
    privileges: { 
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: true
    }}
])

app.commandLine.appendSwitch('lang', 'eng')

app.on('ready', async () => {
  createWindow()

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders as Record<string, string[]>;
    responseHeaders['Cross-Origin-Opener-Policy'] = ['same-origin'];
    responseHeaders['Cross-Origin-Embedder-Policy'] = ['require-corp'];
    callback({ cancel: false, responseHeaders });
  });

  asrStart()
  win?.webContents.send('asr-change', { data: true })

  protocol.registerFileProtocol('play', (request, callback) => {
    const url = request.url.substr(7)
    callback(decodeURI(url));
  })

  i18n.active()
  const menu = Menu.buildFromTemplate(getTemplate())
  Menu.setApplicationMenu(menu)

  const icon = nativeImage.createFromPath(join(process.env.PUBLIC, 'tray.png'))
  const tray = new Tray(icon)
  const menutemplate: MenuItemConstructorOptions[] = [
    { label: 'Play', type: 'normal'},
    { label: i18n.__('Quit'), role: 'quit', type: 'normal' }
  ]
  menutemplate[0].click = () => {
    if (playstatus == 0) {
      menutemplate[0].label = 'Pause'
      win?.webContents.send('play-action', 1)
    } else {
      menutemplate[0].label = 'Play'
      win?.webContents.send('play-action', 0)
    }
    const contextMenu = Menu.buildFromTemplate(menutemplate as MenuItemConstructorOptions[])
    tray.setContextMenu(contextMenu)
  }

  const contextMenu = Menu.buildFromTemplate(menutemplate as MenuItemConstructorOptions[])
  tray.setContextMenu(contextMenu)
  tray.setToolTip('JJPlayer')

  // TODO: remove hardcoded test file path
  // const usefile = "/Users/admin/proj/github/mmp/mpp/test.mp4"
  // var mimeCodec = await GetMimeCodecs(usefile)
  // if (mimeCodec.startsWith("video/x-matroska")) {
  //   mimeCodec = mimeCodec.replace("video/x-matroska", "video/mp4")
  // } else if (mimeCodec.startsWith("video/quicktime")) {
  //   mimeCodec = mimeCodec.replace("video/quicktime", "video/mp4")
  // }
  // win?.webContents.once('did-finish-load', ()=> {
  //   console.log("mime", mimeCodec)
  //   win?.webContents.send('file-selected', { path: usefile, mime: mimeCodec });
  // })
})

// app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
  asrStop()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// MacOS open recent events
app.on('open-file', async (event, path) => {
  event.preventDefault()
  win?.setTitle(basename(path))
  var mimeCodec = await GetMimeCodecs(path)
  if (mimeCodec.startsWith("video/x-matroska")) {
    mimeCodec = mimeCodec.replace("video/x-matroska", "video/mp4")
  } else if (mimeCodec.startsWith("video/quicktime")) {
    mimeCodec = mimeCodec.replace("video/quicktime", "video/mp4")
  }
  win?.webContents.send('file-selected', { path: path, mime: mimeCodec })
  if (mimeCodec == 'audio/pcm') {
    const pcm = new Float32Array(fs.readFileSync(path).buffer)
    asrTranscribe(pcm)
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${url}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

ipcMain.handle('show-context-menu', () => {
  const menutemplate = [
      { label: "Play", type: 'normal'},
      { type: "separator"},
      { label: 'Open', click: () => { show_open_dialog() }},
      { role: 'close'},
    ]
  if (playstatus == 0) {
    menutemplate[0].label = 'Play'
  } else {
    menutemplate[0].label = 'Pause'
  }
  menutemplate[0].click = () => {
    if (playstatus === 0) {
      win?.webContents.send('play-action', 1)
    } else {
      win?.webContents.send('play-action', 0)
    }
  }
  const menu = Menu.buildFromTemplate(menutemplate as MenuItemConstructorOptions[])
  menu.popup();
})

ipcMain.on('show-error-box', (event, arg) => {
  dialog.showErrorBox('Oops! Something went wrong!', 'Help us improve your experience by sending an error report')
});

ipcMain.on('play-progress', (event, progress) => {
  win?.setProgressBar(progress)
})

ipcMain.on('play-status', (e, value) => {
  playstatus = value
})

ipcMain.on('audio-channel', (event, data: Float32Array) => {
  asrTranscribe(data, 16000)
});