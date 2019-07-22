import { Application } from '../../Application';
import { Response, RequestHandler } from 'express';
import path from 'path';

export class AbstractController {

  public static jsonResponse(res: Response, data: any = {}) {
    res.send(data);
  }

  public static successResponse(res: Response, data: any = {}) {
    res.send({ success: true, error: false, result: true, ...data });
  }

  public static errorResponse(res: Response, message: string, data: any = {}) {
    res.send({ success: false, error: true, errorMessage: message, ...data });
  }

  public static notFoundResponse(res: Response) {
    return this.errorResponse(res, 'not_found');
  }

  public static accessDeniedResponse(res: Response) {
    return this.errorResponse(res, 'access_denied');
  }

  constructor(protected readonly app: Application, readonly templatesPath?: string) {}

  public jsonResponse(res: Response, data: any = {}) { return AbstractController.jsonResponse(res, data); }

  public successResponse(res: Response, data: any = {}) { return AbstractController.successResponse(res, data); }

  public errorResponse(res: Response, message: string, data: any = {}) { return AbstractController.errorResponse(res, message, data); }

  public notFoundResponse(res: Response) { return AbstractController.notFoundResponse(res); }

  public accessDeniedResponse(res: Response) { return AbstractController.accessDeniedResponse(res); }

  protected post(url: string, method: RequestHandler) {
    this.app.http.post(url, method.bind(this));
  }

  protected get(url: string, method: RequestHandler) {
    this.app.http.get(url, method.bind(this));
  }

  protected render(res: Response, template: string, params: { [key: string]: any } = {}) {
    const content = this.app.templateService.render(
      this.templatesPath ? path.join(this.templatesPath, template) : template,
      params,
    );
    return res.send(content);
  }

}
