module.exports = {
  welcome: 'Welcome to Rural Health Support.',
  languageSelection: 'Please select your language:\n\nReply:\n1 - Telugu\n2 - Hindi\n3 - English\n4 - Contact / Support\n5 - Emergency SOS',
  contactSupport: 'Please contact your local health worker for assistance.',
  emergencyLocation: 'Emergency request received. Please share your village or location.',
  emergencyLocationConfirm: location => `I understood your location as ${location}. Reply 1 to confirm or 2 to say your location again.`,
  emergencyLocationFailed: 'I could not resolve that location. Please share your village or location again.',
  emergencyRegistered: 'Emergency request received. A health worker has been alerted.',
  askName: 'Please enter your full name.',
  askAge: 'Please enter your age.',
  askGender: 'Please select your gender:\n\n1. Male\n2. Female\n3. Other',
  askLocation: 'Please enter your village or location.',
  askSymptoms: 'What health problem are you currently experiencing?\n\nYou can describe it in your own words.',
  askConfirmation: 'Please confirm your information.\n\nReply 1 to confirm, 2 to edit information, or 3 to start again.',
  invalidConfirmation: 'Please reply 1 to confirm, 2 to edit, or 3 to start again.',
  completed: 'Thank you.\n\nYour information has been successfully collected.',
  registrationFailed: 'We are sorry, we could not complete your registration right now.\nPlease try again shortly.',
  invalidLanguage: 'Invalid option.\n\nReply 1, 2, 3, 4, or 5.',
  invalidAge: 'Please enter a valid age between 1 and 120.',
  invalidGender: 'Please select a valid option:\n\n1. Male\n2. Female\n3. Other',
  askDuration: 'How long have you had this problem?\n\n1 - Less than 1 day\n2 - 1 to 3 days\n3 - 4 to 7 days\n4 - More than 1 week\n5 - More than 1 month\n(Or reply with your own words, e.g., "3 days")',
  askSeverity: 'How severe is your problem?\n\n1 - Mild\n2 - Moderate\n3 - Severe',
  askEmergencyScreen: 'Do you have any emergency symptoms?\n\n1 - Severe chest pain\n2 - Severe breathing difficulty\n3 - Heavy bleeding\n4 - Unconscious/fainting\n5 - None of these',
  askOptionalDocument: 'Do you have an existing medical report or prescription?\n\n1 - Upload document\n2 - Skip',
  documentUploadPrompt: 'Please use the "Attach Document" button to upload your report or prescription, or reply 2 to skip.',
  documentUploaded: docName => `Document "${docName}" received. You may reply 1 to continue to confirmation or attach another document.`,
  welcomeBack: name => `Welcome back, ${name || 'Patient'}! What health problem are you currently experiencing?\n\nYou can describe it in your own words.`,
  mainMenu: 'Main Menu:\n\n1 - Register New Health Complaint\n2 - Check Case Status\n3 - Emergency SOS\n4 - Contact Support',
  smsHelp: 'CareOS SMS Help:\nReply HI to start\nMENU for options\nSTATUS for case updates\nEMERGENCY for immediate SOS\nRESET to start over',
  caseCreated: (caseId, facilityName) => `Your care request has been registered (ID: ${caseId}).${facilityName ? ` Assigned Health Centre: ${facilityName}.` : ''}`,
  caseCreatedDetailed: ({ caseId, status, facilityName }) =>
    `✅ Your health complaint has been registered.\n\nCase ID: ${caseId}\nStatus: ${status || 'ASSIGNED'}${facilityName ? `\nAssigned Health Centre: ${facilityName}` : '\nHealth Centre: Pending Assignment'}\n\nA health worker will review your case shortly.`,
  confirmationSummary: data =>
    `Please confirm your information:\n` +
    `Name: ${data.name || 'Not provided'}\n` +
    `Age: ${data.age || 'Not provided'}\n` +
    `Gender: ${data.gender ? (data.gender.charAt(0).toUpperCase() + data.gender.slice(1)) : 'Not provided'}\n` +
    `Location: ${data.village || 'Not provided'}\n` +
    `Health problem: ${data.symptomsDescription || 'Not provided'}\n` +
    `Duration: ${data.duration || 'Not specified'}\n` +
    `Severity: ${data.severity || 'Not specified'}\n\n` +
    `1 - Confirm\n` +
    `2 - Edit information\n` +
    `3 - Start again`,
  askEditField:
    `What would you like to change?\n\n` +
    `1 - Name\n` +
    `2 - Age\n` +
    `3 - Gender\n` +
    `4 - Location\n` +
    `5 - Health problem\n` +
    `6 - Duration\n` +
    `7 - Severity\n` +
    `8 - Emergency symptoms\n` +
    `9 - Back to confirmation`,
  fieldUpdated: fieldLabel => `${fieldLabel} updated.`,
  statusResponse: cases => cases && cases.length ? `Your active cases:\n${cases.map(c => `- ${c.caseId}: ${c.status} (${(c.complaint || '').slice(0, 30)})`).join('\n')}` : 'You have no active cases registered.',
  cancelled: 'Your session has been cancelled. Reply HI to start again.'
};
