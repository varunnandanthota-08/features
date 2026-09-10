# WhatsApp Patient Registration Backend

This backend implements the V1 WhatsApp registration flow through Twilio, MongoDB, and Express. It does not include complaints, diagnosis, triage, dashboards, or other future features.

## Architecture

```text
WhatsApp -> Twilio -> webhook route -> WhatsApp controller -> Conversation service -> Conversation model
                                                                         |
                                                                         v
                                                               Patient service -> Patient model
```

The controller normalizes Twilio requests and delegates business logic. The WhatsApp service owns Twilio sending, while the Conversation and Patient services own persistence.

## Prerequisites

- Node.js 18 or later
- npm
- MongoDB running locally or a MongoDB connection string
- A Twilio account with WhatsApp Sandbox access
- ngrok for public HTTPS webhook forwarding

## Install

```bash
npm install
```

## Environment

Copy `.env.example` to `.env` and fill in your own values:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/rural-health
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
WHATSAPP_PUBLIC_NUMBER=
TWILIO_WEBHOOK_URL=
TWILIO_VALIDATE_WEBHOOK=false
```

Never commit `.env`. `TWILIO_AUTH_TOKEN` is server-only. In production, webhook validation is automatically enabled. Set `TWILIO_WEBHOOK_URL` to the exact public HTTPS webhook URL when the server is behind a proxy or ngrok. For local automated tests, validation is explicitly disabled with `TWILIO_VALIDATE_WEBHOOK=false`.

## Start The Backend

Start MongoDB first, then run:

```bash
npm install
npm start
```

The server listens on `http://localhost:5000`. Check it with:

```text
GET http://localhost:5000/health
```

## Local WhatsApp Simulator

URL: `http://localhost:5000/whatsapp-simulator.html`

Purpose: development/testing only. This is not real WhatsApp and does not call Twilio or Meta.

Flow:

```text
Browser -> /api/test/whatsapp -> Conversation Service -> MongoDB -> Browser
```

The simulator and its reset endpoint are available only when `NODE_ENV` is not `production`. The browser sends a generated MessageSid, so the existing idempotency behavior is exercised. To test a duplicate directly, send the same `messageId` in two requests. Reset removes only the test Conversation for the selected phone; it does not delete Patient data.

## Phase 1 IVR

Configure the Twilio phone number's **A Call Comes In** Voice webhook as:

```text
POST https://<your-public-host>/api/ivr/incoming
```

The IVR flow is:

```text
Call -> language -> name -> age -> gender -> village -> symptoms -> confirmation -> Patient -> hang up
```

IVR sessions use Twilio `CallSid` and are stored in the existing `Conversation` collection with `channel: "IVR"`. Patient persistence uses the existing Patient service and model. This phase uses DTMF for language and gender and Twilio speech gathering for name, age, village, and symptoms. Telugu is stored as `te`, but Telugu speech recognition is not assumed or configured; the speech steps currently use the English TwiML voice/prompt and should be replaced with an external Telugu STT integration later if required.

IVR endpoints:

```text
POST /api/ivr/incoming
POST /api/ivr/language
POST /api/ivr/name
POST /api/ivr/age
POST /api/ivr/gender
POST /api/ivr/location
POST /api/ivr/symptoms
POST /api/ivr/confirm
```

### Local IVR Simulator

When `NODE_ENV` is not `production`, use the HTTP simulator before connecting a Twilio Voice number:

```text
POST /api/test/ivr/start
POST /api/test/ivr/input
POST /api/test/ivr/reset
```

Example PowerShell flow:

```powershell
$phone = '+910000000001'
$session = (Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/test/ivr/start -ContentType 'application/json' -Body (@{ phone = $phone } | ConvertTo-Json)).sessionId
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/test/ivr/input -ContentType 'application/json' -Body (@{ sessionId = $session; value = '3' } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/test/ivr/input -ContentType 'application/json' -Body (@{ sessionId = $session; value = 'Ravi Kumar' } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/test/ivr/input -ContentType 'application/json' -Body (@{ sessionId = $session; value = '52' } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/test/ivr/input -ContentType 'application/json' -Body (@{ sessionId = $session; value = '1' } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/test/ivr/input -ContentType 'application/json' -Body (@{ sessionId = $session; value = 'Nalgonda' } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/test/ivr/input -ContentType 'application/json' -Body (@{ sessionId = $session; value = 'I have had fever for three days' } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/test/ivr/input -ContentType 'application/json' -Body (@{ sessionId = $session; value = '1' } | ConvertTo-Json)
```

Use the returned `sessionId` for each request, or send `phone` instead to load the current IVR session. The simulator uses the same IVR service handlers as Twilio and does not save a Patient until confirmation. Use the fake number `+910000000001` in tests. It is development-only and is not real WhatsApp or real Voice traffic.

## Run Tests

```bash
npm test
```

Tests mock MongoDB repositories and Twilio sending. They do not send real WhatsApp messages. The production model and services use Mongoose and MongoDB.

## Configure ngrok And Twilio Sandbox

1. Start MongoDB.
2. Start the backend with `npm start`.
3. Start ngrok:

   ```bash
   ngrok http 5000
   ```

4. Copy the HTTPS forwarding domain shown by ngrok.
5. In the Twilio Console, open **Messaging > Try it out > Send a WhatsApp message**, open the WhatsApp Sandbox settings, and enter this URL in **When a message comes in**:

   ```text
   https://<NGROK_DOMAIN>/api/channels/whatsapp/webhook
   ```

   Select the HTTP method `POST`, then save.
6. Join the Sandbox from your phone using the join code shown in the Twilio Console.
7. Send `Hi` from WhatsApp and complete the flow below.

Do not send messages automatically from this project. Twilio credentials and the real Sandbox number must come from your own account.

## WhatsApp Chat Link

The configured public number produces this format:

```text
https://wa.me/<WHATSAPP_PUBLIC_NUMBER>?text=Hi
```

The helper is available from `src/config/whatsapp.js`; it throws when `WHATSAPP_PUBLIC_NUMBER` is not configured. Do not include the `whatsapp:` prefix in a public `wa.me` number.

## Conversation Flow

```text
Hi
3
Ravi Kumar
52
1
Village A
I have fever for three days.
```

The bot asks for language, name, age, gender, village/location, and symptoms. Invalid language, age, or gender input repeats the relevant prompt without advancing. Symptoms are stored as raw text and are not diagnosed or classified.

## MongoDB Verification

After completing the flow, inspect the configured database and verify one document in each collection:

```javascript
db.conversations.findOne({ phone: "+919876543210", channel: "WHATSAPP" })
db.patients.findOne({ phone: "+919876543210" })
```

The conversation should have `state: "COMPLETED"`. The patient should contain the normalized phone, collected fields, nested `location.village`, `language`, raw `symptomsDescription`, and `source: "WHATSAPP"`. It must not contain Twilio credentials, raw webhook payloads, or MessageSid.

Repeating a registration for the same phone updates the existing Patient because `phone` has a unique database index. Re-delivering the same MessageSid does not transition the conversation or send another response.

## Common Errors

- **MongoDB connection failed:** confirm MongoDB is running and `MONGODB_URI` is correct.
- **Invalid webhook signature:** use the exact HTTPS ngrok URL in `TWILIO_WEBHOOK_URL`, and confirm Twilio is calling the same URL saved in the Console.
- **Webhook returns 403 locally:** set `TWILIO_VALIDATE_WEBHOOK=false` only for local testing, or provide a valid Twilio signature and auth token.
- **Twilio cannot reach the webhook:** keep ngrok running, use the HTTPS URL, and confirm the route ends with `/api/channels/whatsapp/webhook`.
- **Twilio sending fails:** verify the account SID, auth token, Sandbox sender, and that the recipient has joined the Sandbox.
- **No response after a database error:** inspect backend logs, fix MongoDB connectivity, and resend the message. The conversation remains incomplete rather than reporting false success.

## Manual Verification Status

Automated tests verify the route, state transitions, patient persistence contract, duplicate handling, failure behavior, chat-link generation, and official Twilio signature validation. A real end-to-end WhatsApp test still requires a running MongoDB instance, real Twilio credentials, an active Twilio Sandbox, and an HTTPS ngrok URL.
