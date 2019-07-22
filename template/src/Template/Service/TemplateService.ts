import { TwingEnvironment, TwingLoaderFilesystem } from 'twing';
import { AbstractService } from '../../Base/Service/AbstractService';
import { Application } from '../../Application';

export class TemplateService extends AbstractService {
  public twig: TwingEnvironment;

  constructor(app: Application) {
    super(app);
    this.twig = new TwingEnvironment(new TwingLoaderFilesystem('./src'));
  }

  public render(template: string, params: { [key: string]: any } = {}): string {
    return this.twig.render(template, params);
  }

}
