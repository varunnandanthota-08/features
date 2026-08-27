require('dotenv').config();

const express = require('express');
const { connectToDatabase } = require('./config/db');
const whatsappRoutes = require('./routes/whatsapp.routes');
const testWhatsappRoutes = require('./routes/testWhatsapp.routes');
const ivrRoutes = require('./routes/ivr.routes');
const testIvrRoutes = require('./routes/testIvr.routes');
const healthCenterRoutes = require('./routes/healthCenter.routes');
const referralRoutes = require('./routes/referral.routes');

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running'
  });
});

app.use('/api/channels/whatsapp', whatsappRoutes);
app.use('/api/ivr', ivrRoutes);
app.use('/api/health-centers', healthCenterRoutes);
app.use('/api/referrals', referralRoutes);

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

    app.listen(port, () => {
      console.log(`[Server] Listening on port ${port}`);
    });
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
