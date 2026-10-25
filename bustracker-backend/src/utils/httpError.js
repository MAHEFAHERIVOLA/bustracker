/** Erreur « attendue » renvoyée au client avec un code HTTP et un message lisible. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

module.exports = { HttpError };
