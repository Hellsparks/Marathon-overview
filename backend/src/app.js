const express = require('express');
const cors = require('cors');
const fs = require('fs');

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
const foldersRouter = require('./routes/folders');
const templatesRouter = require('./routes/templates');
const projectsRouter = require('./routes/projects');
const updatesRouter = require('./routes/updates');
const statsRouter = require('./routes/stats');
const errorHandler = require('./middleware/errorHandler');

const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Application routes
app.use('/api/printers', printersRouter);
app.use('/api/files', filesRouter);
app.use('/api/folders', foldersRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/status', statusRouter);
app.use('/api/printers', queueRouter);   // /api/printers/:id/queue
app.use('/api/printers', controlRouter); // /api/printers/:id/print/*
app.use('/api/presets', presetsRouter);
app.use('/api/themes', themesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/spoolman', spoolmanRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/updates', updatesRouter);
app.use('/api/stats', statsRouter);

// Statically serve cloned Community Themes — dotfiles: 'allow' exposes .theme/ subdirectories
app.use('/themes', express.static(path.join(__dirname, '../data/themes'), { dotfiles: 'allow' }));

// OctoPrint-compatible routes — slicers hit /api/version, /api/printer, /api/files/local
// Mounted at /api so paths match OctoPrint exactly
app.use('/api', octoprintRouter);

// Serve the built frontend for non-Docker / direct deployments.
// OrcaSlicer's device tab does GET / to show the web UI — this makes it work
// when hitting the backend directly (port 3000). In Docker, nginx handles it.
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

app.use(errorHandler);

module.exports = app;
