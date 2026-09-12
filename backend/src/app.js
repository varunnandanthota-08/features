require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { connectToDatabase } = require('./config/db');
const whatsappRoutes = require('./routes/whatsapp.routes');
const testWhatsappRoutes = require('./routes/testWhatsapp.routes');
const ivrRoutes = require('./routes/ivr.routes');
const testIvrRoutes = require('./routes/testIvr.routes');
const healthCenterRoutes = require('./routes/healthCenter.routes');
const referralRoutes = require('./routes/referral.routes');
const smsRoutes = require('./routes/sms.routes');
const documentRoutes = require('./routes/document.routes');
const emergencyRoutes = require('./routes/emergency.routes');
const caseRoutes = require('./routes/case.routes');
const { startEscalationMonitor, stopEscalationMonitor } = require('./services/escalation.monitor');

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running'
  });
});

app.use('/api/channels/whatsapp', whatsappRoutes);
app.use('/api/channels/sms', smsRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/ivr', ivrRoutes);
app.use('/api/health-centers', healthCenterRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/cases', caseRoutes);

if (process.env.NODE_ENV !== 'production') {
  app.use('/api/test/whatsapp', testWhatsappRoutes);
  app.use('/api/test/ivr', testIvrRoutes);
  app.use(express.static('public'));
}

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use((error, req, res, next) => {
  console.error('[Server] Unhandled error:', error.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

async function startServer() {
  try {
    const databaseConfigured = await connectToDatabase();
    console.log(databaseConfigured ? '[MongoDB] Connected' : '[MongoDB] MONGODB_URI not configured; skipped connection');

    const server = app.listen(port, () => {
      console.log(`[Server] Listening on port ${port}`);
      startEscalationMonitor();
    });
    return server;
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  startServer().then(server => {
    if (!server) return;
    const shutdown = () => {
      stopEscalationMonitor();
      server.close();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

module.exports = { app, startServer };
