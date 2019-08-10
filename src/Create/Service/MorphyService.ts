// tslint:disable:quotemark

import { AbstractService } from '../../Base/Service/AbstractService'
import fs from 'fs'
import path from 'path'

export interface ILintConfig {
    tabSize: number
    semicolon: boolean
    doubleQuotemark: boolean
}

export interface IMorphyConfig {
    name: string
    useDb: 'postgres'
    useTwing: boolean
    useLogger: boolean
    tabSize: number
    semicolon: boolean
    doubleQuotemark: boolean
    port: number
}

export class MorphyService extends AbstractService {

    public isDirCopyNeeded(dirname: string, config: IMorphyConfig) {
        if (!config.useDb && path.basename(dirname) === 'Database') {
            return false
        }
        if (!config.useTwing && path.basename(dirname) === 'Template') {
            return false
        }
        if (!config.useLogger && path.basename(dirname) === 'Logger') {
            return false
        }
        return true
    }

    public morphyFile(srcFile: string, destFile: string, config: IMorphyConfig) {
        if (destFile.indexOf('.gitignore.template') >= 0) {
            destFile = destFile.replace('.gitignore.template', '.gitignore')
        }
        const basename = path.basename(srcFile)
        if (basename === 'package.json') {
            const json = JSON.parse(fs.readFileSync(srcFile).toString())
            json.name = config.name
            if (!config.useDb) {
                delete json.dependencies.typeorm
                delete json.dependencies.pg
            }
            if (!config.useTwing) {
                delete json.dependencies['@types/luxon']
                delete json.dependencies.twing
            }
            fs.writeFileSync(destFile, JSON.stringify(json, undefined, config.tabSize))
            return
        }

        let code = fs.readFileSync(srcFile).toString()
        if (['package-lock.json'].indexOf(basename) >= 0) {
            return
        }
        if (!config.useLogger) {
            if (basename === 'Application.ts') {
                code = code.replace('import { LoggerService } from \'./Logger/Service/LoggerService\';\n', '')
                code = code.replace('    public loggerService!: LoggerService;\n', '')
                code = code.replace('        this.loggerService = new LoggerService(this);\n', '')
            } else if (['config.js', 'config.js.dist'].indexOf(basename) >= 0) {
                code = code.replace('    logdir: \'logs\',\n', '')
            } else if (basename === 'global.d.ts') {
                code = code.replace('    logdir: string;\n', '')
            }
        }
        if (!config.useTwing) {
            if (basename === 'Application.ts') {
                code = code.replace('import { TemplateService } from \'./Template/Service/TemplateService\';\n', '')
                code = code.replace('    public templateService!: TemplateService;\n', '')
                code = code.replace('        this.templateService = new TemplateService(this);\n', '')
            } else if (basename === 'AbstractController.ts') {
                code = code.replace(
                    'constructor(protected readonly app: Application, readonly templatesPath?: string) {}',
                    'constructor(protected readonly app: Application) {}',
                )
                code = code.replace(
                    "    protected render(res: Response, template: string, params: { [key: string]: any } = {}) {\n" +
                    "        const content = this.app.templateService.render(\n" +
                    "            this.templatesPath ? path.join(this.templatesPath, template) : template,\n" +
                    "            params,\n" +
                    "        );\n" +
                    "        return res.send(content);\n" +
                    "    }\n", '')
            }
        }
        if (!config.useDb) {
            if (basename === 'Application.ts') {
                code = code.replace('import { DbService } from \'./Database/Service/DbService\';\n', '')
                code = code.replace('    public dbService!: DbService;\n', '')
                code = code.replace('        this.dbService = new DbService(this);\n', '')
            } else if (['config.js', 'config.js.dist'].indexOf(basename) >= 0) {
                code = code.replace("    db: {\n        name: 'db name',\n        user: 'db user',\n        password: 'db password',\n    },\n", '')
            } else if (basename === 'global.d.ts') {
                code = code.replace("    db: {\n        name: string;\n        user: string;\n        password: string;\n    };\n", '')
            }
        }
        if (!config.semicolon) {
            if (basename === 'tslint.json') {
                code = code.replace('"semicolon": { "options": "always" },', '"semicolon": { "options": "never" },')
            }
        }
        if (config.doubleQuotemark) {
            code = code.replace('"quotemark": { "options": "single" },', '"quotemark": { "options": "double" },')
        }
        if (['config.js', 'config.js.dist'].indexOf(basename) >= 0) {
            code = code.replace('1000000000', `${config.port}`)
        }
        if (['.ts', '.js'].indexOf(path.extname(srcFile).toLowerCase()) >= 0) {
            code = this.lint(code, config)
        }
        fs.writeFileSync(destFile, code)
    }

    public lint(code: string, config: ILintConfig) {
        if (config.tabSize !== 4) {
            let str = ''
            for (str = ''; str.length < config.tabSize; str += ' ') {/**/ }
            code = code.replace(/  /g, str)
        }
        if (!config.semicolon) {
            code = code.replace(/;/g, '')
        }
        if (config.doubleQuotemark) {
            code = code.replace(/'/g, '"')
        }
        return code
    }

}
