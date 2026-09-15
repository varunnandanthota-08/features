async function runTests() {
  const url = 'http://localhost:5678/webhook/4842ad21-7788-49bb-aaec-718b0ffc0609/chat';
  
  const queries = [
    { name: 'English 1', text: 'Does CareOS provide ambulance service?' },
    { name: 'Telugu 1', text: 'కేరోస్ అంబులెన్స్ సేవను అందిస్తుందా?' },
    { name: 'Hindi 1', text: 'क्या CareOS एम्बुलेंस सेवा प्रदान करता है?' },
    { name: 'English 2', text: 'What is CareOS?' },
    { name: 'Telugu 2', text: 'CareOS అంటే ఏమిటి?' },
    { name: 'Hindi 2', text: 'CareOS क्या है?' }
  ];

  let i = 0;
  for (const q of queries) {
    try {
      console.log(`\n--- Test: ${q.name} ---`);
      console.log(`Query: ${q.text}`);
      
      const sessionId = 'test-session-' + Date.now() + '-' + (i++);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sendMessage', sessionId, chatInput: q.text })
      });
      
      if (!response.ok) {
        console.error('Request failed:', response.status);
        continue;
      }
      
      const data = await response.json();
      console.log(`Response: ${data.output}`);
    } catch (e) {
      console.error(e.message);
    }
  }
}

runTests();
