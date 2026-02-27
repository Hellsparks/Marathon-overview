const express = require('express');
const cors = require('cors');

const printersRouter = require('./routes/printers');
const filesRouter = require('./routes/files');
const statusRouter = require('./routes/status');
const queueRouter = require('./routes/queue');
const controlRouter = require('./routes/control');
const octoprintRouter = require('./routes/octoprint');
const presetsRouter = require('./routes/presets');
const errorHandler = require('./middleware/errorHandler');

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

// OctoPrint-compatible routes — slicers hit /api/version, /api/printer, /api/files/local
// Mounted at /api so paths match OctoPrint exactly
app.use('/api', octoprintRouter);

app.use(errorHandler);

module.exports = app;
