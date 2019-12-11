import Express from 'express';
import { AbstractConsoleCommand } from './Base/Console/AbstractConsoleCommand';
import { DbService } from './Database/Service/DbService';
import { HelpCommand } from './Base/Console/HelpCommand';
import { LoggerService } from './Logger/Service/LoggerService';
import { TemplateService } from './Template/Service/TemplateService';
import { CreateMigrationCommand } from './Database/Console/CreateMigrationCommand';
import { MigrateCommand } from './Database/Console/MigrateCommand';
import { MigrateUndoCommand } from './Database/Console/MigrateUndoCommand';

export class Application {
    public http!: Express.Express;

    // Services
    public loggerService!: LoggerService;
    public dbService!: DbService;
    public templateService!: TemplateService;

    // Commands
    public helpCommand!: HelpCommand;
    public createMigrationCommand!: CreateMigrationCommand;
    public migrateCommand!: MigrateCommand;
    public migrateUndoCommand!: MigrateUndoCommand;

    // Controllers

    public constructor(public readonly config: IConfig) { }

    public async run() {
        this.initializeServices();
        if (process.argv[2]) {
            this.initializeCommands();
            for (const command of Object.values(this)
                .filter((c: any) => c instanceof AbstractConsoleCommand) as AbstractConsoleCommand[]
            ) {
                if (command.name === process.argv[2]) {
                    await command.execute();
                    process.exit();
                }
            }
            await this.helpCommand.execute();
            process.exit();
        } else {
            this.runWebServer();
        }
    }

    protected runWebServer() {
        this.http = Express();
        this.http.use('/public', Express.static('public'));
        this.http.use(Express.urlencoded());
        this.http.listen(this.config.listen, () => console.log(`Listening on port ${this.config.listen}`));

        this.initializeControllers();
    }

    protected initializeServices() {
        this.loggerService = new LoggerService(this);
        this.dbService = new DbService(this);
        this.templateService = new TemplateService(this);
    }

    protected initializeCommands() {
        this.helpCommand = new HelpCommand(this);
        this.createMigrationCommand = new CreateMigrationCommand(this);
        this.migrateCommand = new MigrateCommand(this);
        this.migrateUndoCommand = new MigrateUndoCommand(this);
    }

    protected initializeControllers() {

    }

}
