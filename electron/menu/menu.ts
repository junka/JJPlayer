import { dialog, shell, nativeTheme, app, MenuItemConstructorOptions, MenuItem } from 'electron'
import { update } from '../main/update'
import { basename } from 'node:path'
import { i18n } from '../i18n/i18n'
import { win } from '../main'
import * as fs from 'node:fs'
import { whisper_factory } from '../whisper/whisper'
import { GetMimeCodecs } from 'ffmime'


export var gwhisper: any = null
export function whisperInit() {
    if (gwhisper === null) {
        whisper_factory({
            print : (e: any) => {
                const span = e.match(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/)
                if (span !== null) {
                    const text = span[0] +'\n-' + e.slice(e.indexOf(span[0]) + span[0].length + 1) + '\n'
                    console.log("right:", e)
                    win?.webContents.send('subtitle-txt', { subtitle: text })
                }
            },
            printErr: (e: any) => {
                //this override could depress init logging
            }
        }).then((whisper: any) => {
            const modname = 'whisper.bin'
            const data = fs.readFileSync(process.env.PUBLIC + "/ggml-tiny.bin")
            try {
                whisper.FS_unlink(modname)
            } catch (e) {
            }
            whisper.FS_createDataFile("/", modname, data, true, true)
            const ret = whisper.init(modname)
            if (ret == false) {
                console.log("fail to init whisper, exit")
                process.exit(1)
            }
            
            gwhisper = whisper
        }).catch((e: any) => {
            console.log(e)
        })
    }
}

function whisperUninit() {
    console.log(gwhisper)
    if (gwhisper) {
        gwhisper.free()
        gwhisper = null
    }
}

function show_about_dialog() {
    dialog.showMessageBox({
        title: i18n.__('About JJPlayer'),
        message: "Version: 1.0.0\n" +
            "Electron: " + process.versions.electron + "\n" +
            "Node: " + process.versions.node + "\n" +
            "Chrome: " + process.versions.chrome + "\n" +
            "V8: " + process.versions.v8 + "\n"
    })
}

export function show_open_dialog() {
    dialog.showOpenDialog({
        title: i18n.__('Open'),
        defaultPath: '~/Downloads',
        filters: [
            { name: 'Media Files', extensions: ['mkv', 'mp4', 'ogg', 'webm', 'wav', 'ts', 'mov', 'mp3', 'pcmf32', 'flv', '3gp', 'rm'] },
        ],
        properties: ['openFile'],
    }).then(result => {
        if (!result.canceled) {
            win?.setTitle(basename(result.filePaths[0]))
            var mimeCodec = GetMimeCodecs(result.filePaths[0])
            if (mimeCodec.startsWith("video/x-matroska")) {
                mimeCodec = mimeCodec.replace("video/x-matroska", "video/mp4")
            } else if (mimeCodec.startsWith("video/quicktime")) {
                mimeCodec = mimeCodec.replace("video/quicktime", "video/mp4")
            }
            win?.webContents.send('file-selected', { path: result.filePaths[0], mime: mimeCodec })
            app.addRecentDocument(result.filePaths[0])
        }
    }).catch(err => {
        console.log(err)
    })
}

function show_subtitle_dialog() {
    dialog.showOpenDialog({
        title: i18n.__('Open'),
        defaultPath: '~/Downloads',
        filters: [
            { name: 'Subtitle Files', extensions: ['srt', 'sub', 'vtt'] },
        ],
        properties: ['openFile', 'multiSelections'],
    }).then(result => {
        if (!result.canceled) {
            win?.webContents.send('subtitle-open', { path: result.filePaths[0] })
        }
    }).catch(err => {
        console.log(err)
    })
}

function show_export_subtitle_dialog() {
    dialog.showSaveDialog({
        title: i18n.__('Save'),
        defaultPath: '~/Downloads/whisper.vtt',
        filters: [
            { name: 'Subtitle Files', extensions: ['vtt'] },
        ],
        properties: ['showOverwriteConfirmation', 'dontAddToRecent'],
    }).then(ret => {
        if (!ret.canceled && ret.filePath) {
            console.log("write to ", ret.filePath)
            win?.webContents.send('subtitle-save', { path: ret.filePath })
        }
    }).catch(err => {})
}


export const getTemplate = (): Array<MenuItemConstructorOptions | MenuItem> => {
    return [
        {
            label: i18n.__('JJPlayer'),
            submenu: [
                {
                    label: i18n.__('About'),
                    click: () => {
                        show_about_dialog()
                    }
                }
            ]
        },
        {
            label: i18n.__('File'),
            submenu: [
                {
                    label: i18n.__('Open Folder'),
                    click: () => {
                        show_open_dialog()
                    },
                    accelerator: 'CmdOrCtrl+O',
                },
                {
                    label: i18n.__('Open'),
                    click: () => {
                        show_open_dialog()
                    },
                    accelerator: 'CmdOrCtrl+O',
                },
                {
                    id : "401",
                    label: i18n.__('Open Recent'),
                    role: "recentDocuments",
                    submenu : [
                        {
                            label: i18n.__('Clear Recently Opened'),
                            role: "clearRecentDocuments",
                        },
                    ]
                },
                {
                    label: i18n.__('Close'),
                    role: 'close',
                    click: () => {
                        win?.close()
                    },
                    accelerator: 'CmdOrCtrl+W',
                }
            ]
        },
        {
            label: i18n.__('Window'),
            role: 'window',
            submenu: [
                {
                    label: i18n.__('Maximize'),
                    click: () => {
                        win?.maximize()
                    }
                },
                {
                    label: i18n.__('Minimize'),
                    click: () => {
                        win?.minimize()
                    }
                },
                {
                    label: i18n.__('Restore'),
                    click: () => {
                        win?.restore()
                    }
                },
                {
                    label: i18n.__('Close'),
                    click: () => {
                        win?.close()
                    }
                },
                {
                    label: i18n.__('Subtitle'),
                    submenu: [
                        {
                            label: "Open",
                            click: () => {
                                show_subtitle_dialog()
                            }
                        },
                        {
                            label: "Whisper",
                            click: () => {
                                if (gwhisper === null) {
                                    whisperInit()
                                    win?.webContents.send('whisper-change', {data: true})
                                } else {
                                    whisperUninit()
                                    win?.webContents.send('whisper-change', { data: false })
                                }
                            }
                        },
                        {
                            label: "export whisper",
                            click: () => {
                                show_export_subtitle_dialog()
                            }
                        }
                    ]
                },
                {
                    id: "901",
                    label: i18n.__('Choose Language'),
                    submenu: [
                        {
                            label: "English",
                            click: () => {
                                win?.webContents.send('lang-change', {lang: 'en'})
                            }
                        },
                        {
                            label: "中文",
                            click: () => {
                                win?.webContents.send('lang-change', {lang: 'cn'})
                            }
                        }
                    ]
                },
                {
                    label: i18n.__('Choose Theme'),
                    submenu: [
                        {
                            label: i18n.__('dark'),
                            click: () => {
                                nativeTheme.themeSource = 'dark'
                            }
                        },
                        {
                            label: i18n.__('light'),
                            click: () => {
                                nativeTheme.themeSource = 'light'
                            }
                        }
                    ]
                }

            ]
        },
        {
            label: i18n.__('Help'),
            submenu: [
                {
                    label: i18n.__('About'),
                    click: () => {
                        show_about_dialog()
                    }
                },
                {
                    label: i18n.__('Learn more'),
                    click() { shell.openExternal('https://github.com/junka/JJPlayer') }
                },
                {
                    label: i18n.__('Update'),
                    click: () => {
                        // if (win)
                        // update(win)
                    }
                }
            ]
        }
    ]
}




