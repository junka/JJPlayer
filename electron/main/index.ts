import { app, session, BrowserWindow, nativeImage, ipcMain, dialog, protocol, Menu, MenuItemConstructorOptions, Tray} from 'electron'
import { release } from 'node:os'
import { join, basename } from 'node:path'
import { update } from './update'
import { getTemplate, show_open_dialog, gwhisper, whisperInit} from '../menu/menu'
import { i18n } from '../i18n/i18n'
import * as fs from 'node:fs'
import { getMimeTypes } from '../../src/mime'
import { FFprobeWorker, Stream, Format } from '../ffprobe/FFprobeWorker'
// import { createFFmpeg } from '@ffmpeg/ffmpeg'

process.env.DIST_ELECTRON = join(__dirname, '../')
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST
process.env.JS_FLAGS = "--experimental-wasm-threads --experimental-wasm-bulk-memory"

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

const ffprobe = new FFprobeWorker()
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


// see https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter
export async function probeMediaFile(file: string) {
  const info = await ffprobe.getFileInfo(file)
  const format = info.format
  const streams = info.streams
  let mimecodec = ""
  let type = null
  console.log(format)
  var codecName = parseFormat(format)
  for (var i = 0; i < format.nb_streams; i ++) {
    console.log(streams[i])
    // const mimeCodec = 'video/mp4; codecs="avc1.4d4016,mp4a.40.2"'
    if (streams[i].codec_type == "video" && (type === null || type === "audio")) {
      type = "video"
    } else if (type === null && streams[i].codec_type == "audio") {
      type = "audio"
    }
    if (streams[i].codec_name === 'h264' || streams[i].codec_name === 'x264') {
      // codec_tag_string/codec_tag is not likyly reliable
      if (mimecodec !== '') {
        mimecodec += ', '
      }
      mimecodec += readavc1(streams[i])
    } else if (streams[i].codec_name === 'vp8' || streams[i].codec_name === 'vp9') {
      if (mimecodec !== '') {
        mimecodec += ','
      }
      mimecodec += streams[i].codec_name
    } else if (streams[i].codec_name === 'aac') {
      if (mimecodec !== '') {
        mimecodec += ', '
      }
      mimecodec += readmp4a(streams[i])
    } else if (streams[i].codec_name === 'vorbis' || streams[i].codec_name === 'opus') {
      if (mimecodec !== '') {
        mimecodec += ','
      }
      mimecodec += streams[i].codec_name
    } else if (streams[i].codec_name === 'mpeg4') {
      if (mimecodec !== '') {
        mimecodec += ','
      }
      mimecodec += streams[i].codec_name
    }
  }
  if (type === 'video') {
    if (codecName =='webm' && mimecodec.includes('avc1')) {
      codecName = 'mp4'
    }
    return 'video/' + codecName + '; codecs="' + mimecodec +'"'
  } else {
    return 'audio/' + codecName
  }
}

// webmedia containers:
// 3GP
// AV1
//            av01.P.LLT.DD[.M.CCC.cp.tc.mc.F]
// ISO BMFF, cccc[.pp]* 
//            (Generic ISO BMFF), 
//            mp4a.oo[.A] (MPEG-4 audio)
//            mp4v.oo[.V] (MPEG-4 video)
//            avc1[.PPCCLL](AVC video)
// MPEG - 4
//            mp4a.oo[.A]
// QuickTime
// WebM
//            cccc.PP.LL.DD
//            cccc.PP.LL.DD.CC.cp.tc.mc.FF

function parseFormat(format: Format) {

  if (format.tags.major_brand !== undefined) {
    if (format.tags.major_brand == '3gp4') {
      return '3gp'
    } else if (format.tags.major_brand.startsWith('iso')) {
      return 'mp4'
    }
  }
  if (format.format_name.indexOf('webm')!== -1) {
    return 'webm'
  } else if (format.format_name.indexOf('mp4') !== -1) {
    return 'mp4'
  }
  return ''
}
 

function parseCodecTags(tag: string) {
  if (tag === '0x31637661') {
    return 'avc1'
  } else if (tag === '0x7634706d') {
    return 'mp4v'
  } else if (tag === '0x6134706d') {
    return 'mp4a'
  }
}

const avc1Profile: any = {
  'Constrained': '42',
  'Baseline': '42',
  'Extended': '58',
  'Main': '4d',
  'High': '64',
  'High10': '6e',
  'High422': '7a',
  'High444': 'f4',
}

const avc1Contraint: any = {
  'Constrained': '40',
  'BaseLine': '00',
  'Extended': '00',
  'Main': '00',
  'High': '00',
}

function readavc1(stream: Stream) {
  var prof = avc1Profile[stream.profile] || 0
  var constrain = avc1Contraint[stream.profile] || '40'
  var constrainValue = (Number(constrain) << 10).toString(16).padStart(2, '0')
  return 'avc1.' + prof + constrainValue + Number(stream.level).toString(16).padStart(2, '0')
}

const mp4aObjectType: any = {
  'Main': '1',
  'LC': '2',
  'SSR': '3',
  'LTP': '4',
  'SBR': '5',
  'Scalable': '6',
};

function readmp4a(stream: Stream) {
  var prof = ''
  prof = mp4aObjectType[stream.profile]
  return 'mp4a.' + "40" + '.' + prof
}


app.on('ready', async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders as Record<string, string[]>;
    responseHeaders['Cross-Origin-Opener-Policy'] = ['same-origin'];
    responseHeaders['Cross-Origin-Embedder-Policy'] = ['require-corp'];
    callback({ cancel: false, responseHeaders });
  });

  whisperInit()
  win?.webContents.send('whisper-change', { data: true })

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

  const usefile = "/Users/admin/proj/github/mmp/mpp/elephants-dream.webm"
  const mimeType = await probeMediaFile(usefile)

  win?.webContents.once('did-finish-load', ()=> {
    console.log("mime", mimeType)
    win?.webContents.send('file-selected', { path: usefile, mime: mimeType });
  })
})


app.commandLine.appendSwitch('lang', 'eng')

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
  gwhisper?.free()
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

function transASR(pcm: Float32Array, tranlate: Boolean) {
  // const data = fs.readFileSync(fname)
  // const pcm = new Float32Array(data.buffer)
  const ret = gwhisper?.full_default(pcm, "en", tranlate)
  if (ret !== 0) {
    console.log("fail to transcribe")
  }
}

// MacOS open recent events
app.on('open-file', async (event, path) => {
  event.preventDefault()
  win?.setTitle(basename(path))
  const mimetype = getMimeTypes(path)
  var mimeCodec
  if (mimetype.startsWith('audio')) { 
    mimeCodec = mimetype
  }
  mimeCodec = await probeMediaFile(path)
  win?.webContents.send('file-selected', { path: path, mime: mimeCodec })
  if (mimeCodec == 'audio/pcm') {
    const data = fs.readFileSync(path)
    const pcm = new Float32Array(data.buffer)
    console.log(pcm)
    const duration = pcm.length/16000
    var round = 0
    console.log("duration is ", duration)
    //every round 5 seconds audio will take 6 seconds to process
    while (duration > 5 * (round + 1)) {
      console.log("round start at ", (new Date().getTime()) / 1000)
      var end = 16000 * 5 * (round + 1) - 1
      if (duration < 5 * (round + 1)) {
        end = 16000 * duration - 1
      }
      transASR(pcm.slice(16000 * 5 *round, end), false)
      round = round + 1
      console.log("round end at", (new Date().getTime()) / 1000)
    }
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
  console.log("channel data", data.length)
  transASR(data, false)
});