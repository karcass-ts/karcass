import { Application } from './Application';

export = (config: IConfig) => {
    const app = new Application(config);
    app.run();
};
