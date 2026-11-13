/** Erro com status HTTP: o handler central responde com a mensagem amigável. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
