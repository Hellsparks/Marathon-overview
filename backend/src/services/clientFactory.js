const MoonrakerClient = require('./moonraker');
const OctoPrintClient = require('./octoprint');
const DuetClient = require('./duet');
const BambuClient = require('./bambu');

/**
 * Return the appropriate printer API client based on the printer's firmware_type.
 * All clients expose the same interface:
 *   getStatus(), startPrint(filename), pausePrint(), resumePrint(), cancelPrint(),
 *   sendGcode(script), uploadFile(filename, buffer),
 *   getQueue(), addToQueue(filenames), removeFromQueue(jobIds), startQueue(),
 *   getMacros(), getWebcams(), getActiveSpoolId()
 *
 * Note: BambuClient is primarily used for control commands only. Status for Bambu
 * printers is managed by bambuManager (MQTT) and written to printerCache directly.
 */
function getClient(printer) {
  switch (printer.firmware_type) {
    case 'octoprint':
      return new OctoPrintClient(printer);
    case 'duet':
      return new DuetClient(printer);
    case 'bambu':
      return new BambuClient(printer);
    default:
      return new MoonrakerClient(printer);
  }
}

module.exports = { getClient };
