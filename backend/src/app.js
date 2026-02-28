const express = require('express');
const cors = require('cors');

const printersRouter = require('./routes/printers');
const filesRouter = require('./routes/files');
const statusRouter = require('./routes/status');
const queueRouter = require('./routes/queue');
const controlRouter = require('./routes/control');
const octoprintRouter = require('./routes/octoprint');
const presetsRouter = require('./routes/presets');
const themesRouter = require('./routes/themes');
const settingsRouter = require('./routes/settings');
const spoolmanRouter = require('./routes/spoolman');
const maintenanceRouter = require('./routes/maintenance');
const errorHandler = require('./middleware/errorHandler');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Application routes
app.use('/api/printers', printersRouter);
app.use('/api/files', filesRouter);
app.use('/api/status', statusRouter);
app.use('/api/printers', queueRouter);   // /api/printers/:id/queue
app.use('/api/printers', controlRouter); // /api/printers/:id/print/*
app.use('/api/presets', presetsRouter);
app.use('/api/themes', themesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/spoolman', spoolmanRouter);
app.use('/api/maintenance', maintenanceRouter);

// Statically serve cloned Community Themes — dotfiles: 'allow' exposes .theme/ subdirectories
app.use('/themes', express.static(path.join(__dirname, '../data/themes'), { dotfiles: 'allow' }));

// OctoPrint-compatible routes — slicers hit /api/version, /api/printer, /api/files/local
// Mounted at /api so paths match OctoPrint exactly
app.use('/api', octoprintRouter);

app.use(errorHandler);

module.exports = app;
