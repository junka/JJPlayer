import { dialog, shell, nativeTheme, app, MenuItemConstructorOptions, MenuItem } from 'electron'
import { update } from '../main/update'
import { basename } from 'node:path'
import { i18n } from '../i18n/i18n'
import { win } from '../main'

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
            { name: 'Media Files', extensions: ['mkv', 'mp4', 'ogg', 'webm', 'wav'] },
        ],
        properties: ['openFile'],
    }).then(result => {
        if (!result.canceled) {
            win?.setTitle(basename(result.filePaths[0]))
            win?.webContents.send('file-selected', { path: result.filePaths[0] })
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
                    click: () => {
                        show_subtitle_dialog()
                    }
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
                    click() { shell.openExternal('https://github.com/junka/pktperf') }
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




