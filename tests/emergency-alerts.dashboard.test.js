const fs = require('fs');
const path = require('path');

const dashboard = fs.readFileSync(
  path.join(__dirname, '../public/emergency-alerts.html'),
  'utf8'
);

describe('emergency escalation dashboard contract', () => {
  test('contains configurable polling and stable escalation detection', () => {
    expect(dashboard).toContain('NOTIFICATION_POLL_INTERVAL_MS');
    expect(dashboard).toContain('state.pollTimer');
    expect(dashboard).toContain('seenEscalations');
    expect(dashboard).toContain('escalationKey');
    expect(dashboard).toContain('Emergency case escalated');
    expect(dashboard).toContain('Case escalated');
  });

  test('shows original, target, current responsibility, and no-target states', () => {
    expect(dashboard).toContain('Escalated from');
    expect(dashboard).toContain('Escalated to');
    expect(dashboard).toContain('Current responsible HC');
    expect(dashboard).toContain('Escalation target unavailable');
    expect(dashboard).toContain('playEscalationNotification');
  });
});