const MoonrakerClient = require('./moonraker');
const OctoPrintClient = require('./octoprint');
const DuetClient = require('./duet');

/**
 * Return the appropriate printer API client based on the printer's firmware_type.
 * All clients expose the same interface:
 *   getStatus(), startPrint(filename), pausePrint(), resumePrint(), cancelPrint(),
 *   sendGcode(script), uploadFile(filename, buffer),
 *   getQueue(), addToQueue(filenames), removeFromQueue(jobIds), startQueue(),
 *   getMacros(), getWebcams(), getActiveSpoolId()
 */
function getClient(printer) {
  switch (printer.firmware_type) {
    case 'octoprint':
      return new OctoPrintClient(printer);
    case 'duet':
      return new DuetClient(printer);
    default:
      return new MoonrakerClient(printer);
  }
}

module.exports = { getClient };
