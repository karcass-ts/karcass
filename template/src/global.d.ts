interface IConfig {
  listen: number;
  logdir: string;
  db: {
    name: string;
    user: string;
    password: string;
  };
}
