import { join } from 'node:path'
import { app } from 'electron'
import cn from './cn.json'
import en from './en.json'

type i18nLocale = Record<string, string>;

export class Locale {
    private loadedLanguage: i18nLocale = {}
    constructor() {
        // if (existsSync(join(__dirname, app.getLocale() + '.json'))) {
        // this.loadedLanguage = JSON.parse(readFileSync(join(__dirname, app.getLocale() + '.json'), 'utf8'))
    }
    public active() {
        if (app.getLocale() === 'zh-CN') {
            this.loadedLanguage = cn
        } else {
            // this.loadedLanguage = JSON.parse(readFileSync(join(__dirname, 'en.json'), 'utf8'))
            this.loadedLanguage = en
        }
    }
    public __(phrase: string): string {
        // console.log('this.loadedLanguage', this.loadedLanguage)
      
        var translation = this.loadedLanguage[phrase]
        if (translation === undefined) {
            translation = phrase
        }
        return translation
    }
}

export const i18n = new Locale()